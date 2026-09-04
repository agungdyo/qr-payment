use std::sync::Arc;

use anyhow::Result;
use axum::{
    extract::{FromRequestParts, Query},
    http::request::Parts,
    response::{IntoResponse, Redirect, Response},
    Json,
};
use base64::Engine;
use openidconnect::{
    core::{CoreClient, CoreProviderMetadata, CoreResponseType},
    reqwest, AuthenticationFlow, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    EndpointMaybeSet, EndpointNotSet, EndpointSet, IssuerUrl, Nonce, PkceCodeChallenge,
    PkceCodeVerifier, ProviderMetadataWithLogout, RedirectUrl, Scope,
};
use serde_json::{json, Value};
use tokio::sync::OnceCell;
use tower_sessions::Session;
use url::Url;
use uuid::Uuid;

use crate::{error::AppError, models::User, state::AppState};

pub const SESSION_USER_KEY: &str = "user_id";
pub const SESSION_ROLES_KEY: &str = "roles";
pub const SESSION_ID_TOKEN_KEY: &str = "id_token";
const SESSION_CSRF_KEY: &str = "oidc_csrf";
const SESSION_NONCE_KEY: &str = "oidc_nonce";
const SESSION_VERIFIER_KEY: &str = "oidc_pkce_verifier";

/// Only these Keycloak realm roles may sign in and use the admin console.
pub const ALLOWED_ROLES: [&str; 2] = ["admin", "operator"];

/// A `CoreClient` fully configured via provider discovery: auth endpoint set,
/// token/userinfo endpoints maybe-set (Keycloak provides both).
pub type ConfiguredCoreClient = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;

/// Lazily-discovered OpenID Connect client. Discovery only happens on the first
/// authorization request, so the server can boot even if Keycloak is briefly down.
#[derive(Clone)]
pub struct OidcClient {
    issuer: String,
    client_id: String,
    client_secret: String,
    redirect_url: String,
    http: reqwest::Client,
    client: Arc<OnceCell<Arc<ConfiguredCoreClient>>>,
}

impl OidcClient {
    pub fn new(
        issuer: String,
        client_id: String,
        client_secret: String,
        redirect_url: String,
    ) -> Result<Self> {
        let http = reqwest::ClientBuilder::new()
            // Following redirects opens the client up to SSRF vulnerabilities.
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self {
            issuer,
            client_id,
            client_secret,
            redirect_url,
            http,
            client: Arc::new(OnceCell::new()),
        })
    }

    pub async fn client(&self) -> Result<Arc<ConfiguredCoreClient>> {
        let client = self
            .client
            .get_or_try_init(|| async {
                let issuer_url = IssuerUrl::new(self.issuer.clone())?;
                let metadata = CoreProviderMetadata::discover_async(issuer_url, &self.http).await?;
                let client = CoreClient::from_provider_metadata(
                    metadata,
                    ClientId::new(self.client_id.clone()),
                    Some(ClientSecret::new(self.client_secret.clone())),
                )
                .set_redirect_uri(RedirectUrl::new(self.redirect_url.clone())?);
                Ok::<_, anyhow::Error>(Arc::new(client))
            })
            .await?;
        Ok(client.clone())
    }

    /// HTTP client used for the token exchange during the callback.
    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    /// Keycloak `end_session_endpoint` for RP-initiated logout (discovered on
    /// demand so logout works even if the cached client is stale).
    pub async fn end_session_endpoint(&self) -> Result<Option<Url>> {
        let issuer_url = IssuerUrl::new(self.issuer.clone())?;
        let metadata = ProviderMetadataWithLogout::discover_async(issuer_url, &self.http).await?;
        Ok(metadata
            .additional_metadata()
            .end_session_endpoint
            .as_ref()
            .map(|endpoint| endpoint.url().clone()))
    }
}

pub struct AuthStart {
    pub url: Url,
    pub csrf: String,
    pub nonce: String,
    pub verifier: String,
}

/// Build the authorization URL (code flow + PKCE) for a fresh login attempt.
pub async fn start_login(oidc: &OidcClient) -> Result<AuthStart> {
    let client = oidc.client().await?;
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, csrf, nonce) = client
        .authorize_url(
            AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .set_pkce_challenge(challenge)
        .url();
    Ok(AuthStart {
        url,
        csrf: csrf.secret().to_string(),
        nonce: nonce.secret().to_string(),
        verifier: verifier.secret().to_string(),
    })
}

/// Decode the raw ID token JWT payload and extract `realm_access.roles`.
fn extract_realm_roles(id_token: &str) -> Vec<String> {
    let Some(payload_segment) = id_token.split('.').nth(1) else {
        return Vec::new();
    };
    let Ok(bytes) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload_segment)
    else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_slice::<Value>(&bytes) else {
        return Vec::new();
    };
    json.pointer("/realm_access/roles")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

pub fn has_staff_role(roles: &[String]) -> bool {
    roles.iter().any(|r| ALLOWED_ROLES.contains(&r.as_str()))
}

/// Extract the user identity from verified ID token claims.
fn claims_to_profile(
    claims: &openidconnect::core::CoreIdTokenClaims,
) -> (String, String, Option<String>, Option<String>) {
    let sub = claims.subject().as_str().to_string();
    let username = claims
        .preferred_username()
        .map(|u| u.as_str().to_string())
        .unwrap_or_else(|| "user".to_string());
    let email = claims.email().map(|e| e.as_str().to_string());
    let name = claims
        .name()
        .and_then(|n| n.get(None))
        .map(|s| s.as_str().to_string());
    (sub, username, email, name)
}

/// Upsert the user from Keycloak claims and return the stored row.
pub async fn upsert_user(
    pool: &sqlx::PgPool,
    claims: &openidconnect::core::CoreIdTokenClaims,
) -> Result<User, AppError> {
    let (sub, username, email, name) = claims_to_profile(claims);
    let display_name = name.clone().unwrap_or_else(|| username.clone());
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (keycloak_sub, username, email, name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (keycloak_sub) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            name = EXCLUDED.name
        RETURNING id, keycloak_sub, username, name, email, created_at
        "#,
    )
    .bind(&sub)
    .bind(&username)
    .bind(&email)
    .bind(&display_name)
    .fetch_one(pool)
    .await?;
    Ok(user)
}

/// Look up a user by primary key.
pub async fn find_user(pool: &sqlx::PgPool, user_id: Uuid) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, keycloak_sub, username, name, email, created_at FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    Ok(user)
}

/// Query parameters on the OIDC callback.
#[derive(serde::Deserialize)]
pub struct CallbackParams {
    pub code: String,
    pub state: String,
}

/// Constant-time string comparison for the OIDC `state` secret.
fn ct_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

/// GET /auth/login — start the authorization code flow.
pub async fn login(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Result<Redirect, AppError> {
    let start = start_login(&state.oidc).await.map_err(AppError::Internal)?;
    session.insert(SESSION_CSRF_KEY, start.csrf).await?;
    session.insert(SESSION_NONCE_KEY, start.nonce).await?;
    session.insert(SESSION_VERIFIER_KEY, start.verifier).await?;
    Ok(Redirect::to(start.url.as_str()))
}

/// GET /auth/callback — exchange the code, verify state/nonce, enforce the
/// admin/operator role, then establish the app session.
pub async fn callback(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
    Query(params): Query<CallbackParams>,
) -> Result<Redirect, AppError> {
    let expected_csrf: String = session
        .get(SESSION_CSRF_KEY)
        .await?
        .ok_or_else(|| AppError::bad_request("no login attempt in progress"))?;
    if !ct_eq(&params.state, &expected_csrf) {
        return Err(AppError::bad_request("state mismatch"));
    }
    let nonce: String = session
        .get(SESSION_NONCE_KEY)
        .await?
        .ok_or_else(|| AppError::bad_request("missing nonce"))?;
    let verifier: String = session
        .get(SESSION_VERIFIER_KEY)
        .await?
        .ok_or_else(|| AppError::bad_request("missing pkce verifier"))?;

    let client = state.oidc.client().await.map_err(AppError::Internal)?;
    let token_response = client
        .exchange_code(AuthorizationCode::new(params.code))
        .map_err(|e| AppError::Internal(e.into()))?
        .set_pkce_verifier(PkceCodeVerifier::new(verifier))
        .request_async(state.oidc.http())
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    // Raw ID token string: used for role extraction (realm_access) and for the
    // RP-initiated logout call to Keycloak's end_session endpoint.
    let id_token = token_response
        .extra_fields()
        .id_token()
        .ok_or_else(|| AppError::bad_request("server did not return an ID token"))?;
    let raw_id_token = id_token.to_string();

    let claims = id_token
        .claims(&client.id_token_verifier(), &Nonce::new(nonce))
        .map_err(|e| AppError::Internal(e.into()))?;

    // Login is restricted to `admin` and `operator` roles only.
    let roles = extract_realm_roles(&raw_id_token);
    if !has_staff_role(&roles) {
        tracing::warn!(
            username = ?claims.preferred_username().map(|u| u.as_str()),
            roles = ?roles,
            "login rejected: user has no admin/operator role"
        );
        return Err(AppError::Forbidden);
    }

    let user = upsert_user(&state.pool, claims).await?;
    session.insert(SESSION_USER_KEY, user.id).await?;
    session.insert(SESSION_ROLES_KEY, roles).await?;
    session.insert(SESSION_ID_TOKEN_KEY, raw_id_token).await?;
    session.remove::<String>(SESSION_CSRF_KEY).await?;
    session.remove::<String>(SESSION_NONCE_KEY).await?;
    session.remove::<String>(SESSION_VERIFIER_KEY).await?;
    session.save().await?;

    Ok(Redirect::to(&format!("{}/admin", state.config.app_url)))
}

/// GET /auth/logout — destroy the app session and end the Keycloak SSO session
/// (RP-initiated logout) before returning to the frontend.
pub async fn logout(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Response {
    let id_token: Option<String> = session.get(SESSION_ID_TOKEN_KEY).await.ok().flatten();
    let _ = session.flush().await;

    let target = match id_token {
        Some(token) => match state.oidc.end_session_endpoint().await {
            Ok(Some(endpoint)) => {
                let mut url = endpoint.clone();
                url.query_pairs_mut()
                    .append_pair("id_token_hint", &token)
                    .append_pair("post_logout_redirect_uri", &state.config.app_url)
                    .append_pair("client_id", &state.config.oidc_client_id);
                url.to_string()
            }
            _ => state.config.app_url.clone(),
        },
        None => state.config.app_url.clone(),
    };
    Redirect::to(&target).into_response()
}

/// GET /auth/me — current session user + roles (frontend `/admin` guard probe).
pub async fn me(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Result<Json<Value>, AppError> {
    let user_id: Option<Uuid> = session.get(SESSION_USER_KEY).await?;
    match user_id {
        Some(id) => {
            let user = find_user(&state.pool, id).await?;
            let roles: Vec<String> = session.get(SESSION_ROLES_KEY).await?.unwrap_or_default();
            Ok(Json(json!({
                "authenticated": true,
                "user": user,
                "roles": roles,
            })))
        }
        None => Ok(Json(json!({ "authenticated": false }))),
    }
}

/// Extractor for admin endpoints: session + `admin`/`operator` role required.
pub struct AuthAdmin(pub User, pub Vec<String>);

impl FromRequestParts<AppState> for AuthAdmin {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthorized)?;
        let user_id: Option<Uuid> = session.get(SESSION_USER_KEY).await?;
        let user_id = user_id.ok_or(AppError::Unauthorized)?;
        let user = find_user(&state.pool, user_id).await?;
        let roles: Vec<String> = session.get(SESSION_ROLES_KEY).await?.unwrap_or_default();
        if !has_staff_role(&roles) {
            return Err(AppError::Forbidden);
        }
        Ok(AuthAdmin(user, roles))
    }
}