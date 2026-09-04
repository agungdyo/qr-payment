mod api;
mod auth;
mod config;
mod error;
mod jobs;
mod maja;
mod models;
mod pricing;
mod state;
mod webhook;

use std::net::SocketAddr;
use std::path::Path;

use anyhow::Result;
use axum::{
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tower_sessions::{cookie::SameSite, Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::PostgresStore;

use crate::{config::Config, state::AppState};

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "qr_payment_api=debug,tower_http=debug,sqlx=warn".into()),
        )
        .init();

    let config = Config::from_env()?;
    let addr: SocketAddr = format!("0.0.0.0:{}", config.port).parse()?;

    // Database pool + migrations.
    let pool = sqlx::PgPool::connect(&config.database_url).await?;
    sqlx::migrate!().run(&pool).await?;
    tracing::info!("database migrations applied");

    // Session store in PostgreSQL.
    let session_store = PostgresStore::new(pool.clone());
    session_store.migrate().await?;
    let session_layer = SessionManagerLayer::new(session_store)
        .with_name(config.session_cookie_name.clone())
        .with_secure(config.session_secure)
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(7)));

    let state = AppState {
        pool,
        oidc: auth::OidcClient::new(
            config.oidc_issuer_url.clone(),
            config.oidc_client_id.clone(),
            config.oidc_client_secret.clone(),
            config.oidc_redirect_url(),
        )?,
        maja: maja::MajaClient::from_config(&config),
        config,
    };

    if state.maja.configured() {
        tracing::info!(
            base_url = %state.maja.base_url,
            "MAJA H2H dikonfigurasi"
        );
    } else {
        tracing::warn!(
            "MAJA H2H BELUM dikonfigurasi (isi MAJA_* env) — endpoint payment akan mengembalikan 503"
        );
    }

    jobs::spawn(state.clone());

    let mut app = Router::new()
        .route("/api/health", get(health))
        // Auth (Keycloak OIDC)
        .route("/auth/login", get(auth::login))
        .route("/auth/callback", get(auth::callback))
        .route("/auth/logout", get(auth::logout))
        .route("/auth/me", get(auth::me))
        // Public (customer) API
        .route("/api/v1/workspaces", get(api::public::list_workspaces))
        .route("/api/v1/workspaces/{code}", get(api::public::get_workspace))
        .route(
            "/api/v1/workspaces/{code}/open-payment",
            get(api::public::open_payment),
        )
        .route(
            "/api/v1/payments/initiate",
            post(api::public::initiate_payment),
        )
        .route("/api/v1/payments/{id}", get(api::public::get_payment))
        .route(
            "/api/v1/payments/{id}/inquiry",
            post(api::public::inquiry_payment),
        )
        .route(
            "/api/v1/payments/{id}/cancel",
            post(api::public::cancel_payment),
        )
        .route("/api/v1/public/settings", get(api::public::public_settings))
        .route("/api/v1/payments/callback", post(webhook::payment_callback))
        // Admin API (AuthAdmin guard: login + role admin|operator)
        .route("/api/v1/admin/stats", get(api::admin::stats))
        .route(
            "/api/v1/admin/workspaces",
            get(api::admin::list_workspaces).post(api::admin::create_workspace),
        )
        .route(
            "/api/v1/admin/workspaces/{code}",
            axum::routing::put(api::admin::update_workspace),
        )
        .route(
            "/api/v1/admin/lockers",
            get(api::admin::list_lockers).post(api::admin::create_locker),
        )
        .route(
            "/api/v1/admin/lockers/{id}",
            axum::routing::put(api::admin::update_locker).delete(api::admin::delete_locker),
        )
        .route(
            "/api/v1/admin/settings",
            get(api::admin::get_settings).put(api::admin::update_settings),
        )
        .route("/api/v1/admin/payments", get(api::admin::list_payments))
        .route(
            "/api/{*path}",
            get(api_not_found).post(api_not_found).put(api_not_found).delete(api_not_found),
        )
        .with_state(state);

    // Serve the built frontend (SPA) when it exists.
    let frontend_dir = Path::new("frontend/dist");
    if frontend_dir.join("index.html").exists() {
        app = app.fallback_service(
            ServeDir::new(frontend_dir)
                .not_found_service(ServeFile::new(frontend_dir.join("index.html"))),
        );
        tracing::info!("serving frontend from {}", frontend_dir.display());
    }

    app = app
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .layer(session_layer);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("qr-payment-api listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "qr-payment-api" }))
}

/// JSON 404 for unknown API paths (instead of falling through to the SPA shell).
async fn api_not_found() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "message": "not found" })),
    )
}