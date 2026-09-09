use std::sync::Arc;

use anyhow::Result;
use axum::{
    extract::Query,
    
    response::Redirect,
    Json,
};
use openidconnect::{
    core::{CoreClient, CoreProviderMetadata, CoreIdTokenClaims, CoreResponseType},
    reqwest, AuthenticationFlow, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    EndpointMaybeSet, EndpointNotSet, EndpointSet, IssuerUrl, Nonce, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope,
};
use serde_json::{json, Value};
use tokio::sync::OnceCell;
use tower_sessions::Session;
use url::Url;
use uuid::Uuid;

use crate::{error::AppError, models::User, state::AppState};

pub const SESSION_USER_KEY: &str = "user_id";
const SESSION_CSRF_KEY: &str = "oidc_csrf";
const SESSION_NONCE_KEY: &str = "oidc_nonce";
const SESSION_VERIFIER_KEY: &str = "oidc_pkce_verifier";

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

/// Extract the user identity from verified ID token claims.
fn claims_to_profile(
    claims: &CoreIdTokenClaims,
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
    claims: &CoreIdTokenClaims,
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
///
/// `code` and `state` are optional because Keycloak sometimes redirects back
/// without an authorization code: the user cancelled login (`error=access_denied`),
/// or a second login flow was started on the same browser while the first one was
/// still active and Keycloak bounced it back with `error=already_logged_in` without
/// re-issuing a code. Those are normal flow outcomes, not protocol errors.
#[derive(serde::Deserialize)]
pub struct CallbackParams {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Remove the in-flight OIDC flow secrets (CSRF/nonce/PKCE verifier) from the session.
async fn clear_oidc_flow(session: &Session) -> Result<(), tower_sessions::session::Error> {
    session.remove::<String>(SESSION_CSRF_KEY).await?;
    session.remove::<String>(SESSION_NONCE_KEY).await?;
    session.remove::<String>(SESSION_VERIFIER_KEY).await?;
    Ok(())
}

/// Bounce the browser back to the frontend after a failed or cancelled login flow.
fn login_failed_redirect(app_url: &str) -> Redirect {
    Redirect::to(&format!("{app_url}/?error=login_failed"))
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

/// GET /auth/callback — exchange the code, verify state/nonce, upsert the user
/// and establish the app session.
pub async fn callback(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
    Query(params): Query<CallbackParams>,
) -> Result<Redirect, AppError> {
    let expected_csrf: String = session
        .get(SESSION_CSRF_KEY)
        .await?
        .ok_or_else(|| AppError::bad_request("no login attempt in progress"))?;

    // Keycloak can redirect back without a `code` — e.g. the user cancelled the
    // login, or a second concurrent login flow was bounced with `error=already_logged_in`.
    // Treat that as a cancelled flow: clean up and send the user home to retry,
    // instead of failing with a raw deserialization error.
    let code = match params.code {
        Some(code) => code,
        None => {
            tracing::warn!(
                error = ?params.error,
                "OIDC callback received no authorization code; redirecting to frontend"
            );
            clear_oidc_flow(&session).await?;
            return Ok(login_failed_redirect(&state.config.app_url));
        }
    };

    match params.state {
        Some(state_param) if ct_eq(&state_param, &expected_csrf) => {}
        Some(_) => {
            tracing::warn!("OIDC callback state mismatch; redirecting to frontend");
            clear_oidc_flow(&session).await?;
            return Ok(login_failed_redirect(&state.config.app_url));
        }
        None => {
            tracing::warn!("OIDC callback missing state parameter; redirecting to frontend");
            clear_oidc_flow(&session).await?;
            return Ok(login_failed_redirect(&state.config.app_url));
        }
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
    // A replayed or expired code (e.g. the browser re-submitted the callback URL)
    // fails the exchange — that is a flow-level failure, so send the user back to
    // retry instead of surfacing a 500.
    let token_response = match client.exchange_code(AuthorizationCode::new(code)) {
        Ok(request) => {
            match request
                .set_pkce_verifier(PkceCodeVerifier::new(verifier))
                .request_async(state.oidc.http())
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    tracing::warn!(error = ?e, "OIDC token exchange failed; redirecting to frontend");
                    clear_oidc_flow(&session).await?;
                    return Ok(login_failed_redirect(&state.config.app_url));
                }
            }
        }
        Err(e) => {
            tracing::warn!(error = ?e, "OIDC token request build failed; redirecting to frontend");
            clear_oidc_flow(&session).await?;
            return Ok(login_failed_redirect(&state.config.app_url));
        }
    };
    let id_token = token_response
        .extra_fields()
        .id_token()
        .ok_or_else(|| AppError::bad_request("server did not return an ID token"))?;
    let claims = id_token
        .claims(&client.id_token_verifier(), &Nonce::new(nonce))
        .map_err(|e| AppError::Internal(e.into()))?;
    // ============================================================
    // DEBUG: Print all ID Token claims to see token structure
    // ============================================================
    println!("\n============================================================");
    println!("DEBUG: ID Token Claims dari Keycloak");
    println!("============================================================");
    println!("Subject (sub):        {}", claims.subject().as_str());
    println!("Issuer:              {}", claims.issuer().as_str());
    println!("Audience:            {:?}", claims.audiences());
    println!("Preferred Username:  {:?}", claims.preferred_username().map(|u| u.as_str()));
    println!("Email:               {:?}", claims.email().map(|e| e.as_str()));
    println!("Name:                {:?}", claims.name().and_then(|n| n.get(None)).map(|s| s.as_str()));
    println!("============================================================");
    
    // Decode raw JWT payload untuk melihat semua claims termasuk roles
    use base64::Engine;
    let id_token_str = id_token.to_string();
    let parts: Vec<&str> = id_token_str.split('.').collect();
    if parts.len() == 3 {
        if let Ok(payload_bytes) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[1]) {
            if let Ok(payload_json) = String::from_utf8(payload_bytes) {
                println!("\nDEBUG: RAW JWT Payload (semua claims termasuk roles):");
                println!("------------------------------------------------------------");
                // Pretty print JSON
                if let Ok(formatted) = serde_json::from_str::<serde_json::Value>(&payload_json) {
                    println!("{}", serde_json::to_string_pretty(&formatted).unwrap_or_default());
                } else {
                    println!("{}", payload_json);
                }
                println!("------------------------------------------------------------\n");
                
                // ============================================================
                // VALIDASI ROLE: Cek apakah user punya role "admin"
                // Roles ada di: resource_access.{client_id}.roles ATAU realm_access.roles
                // ============================================================
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&payload_json) {
                    let client_id = &state.config.oidc_client_id;
                    let mut has_admin_role = false;
                    
                    println!("============================================================");
                    println!("ROLE VALIDATION START");
                    println!("============================================================");
                    
                    // Cek di resource_access.{client_id}.roles (prioritas utama)
                    if let Some(resource_access) = payload.get("resource_access").and_then(|ra| ra.get(client_id)) {
                        if let Some(roles) = resource_access.get("roles").and_then(|r| r.as_array()) {
                            let roles_str: Vec<&str> = roles.iter().filter_map(|r| r.as_str()).collect();
                            println!("resource_access.{}.roles = {:?}", client_id, roles_str);
                            
                            if roles_str.contains(&"admin") {
                                has_admin_role = true;
                            }
                        }
                    }
                    
                    // Fallback: cek di realm_access.roles
                    if !has_admin_role {
                        if let Some(realm_access) = payload.get("realm_access") {
                            if let Some(roles) = realm_access.get("roles").and_then(|r| r.as_array()) {
                                let roles_str: Vec<&str> = roles.iter().filter_map(|r| r.as_str()).collect();
                                println!("realm_access.roles = {:?}", roles_str);
                                
                                if roles_str.contains(&"admin") {
                                    has_admin_role = true;
                                }
                            }
                        }
                    }
                    
                    println!("Final has_admin_role = {}", has_admin_role);
                    println!("============================================================");
                    
                    // JIKA TIDAK ADA ROLE ADMIN SAMA SEKALI → DENY
                    if !has_admin_role {
                        println!(" ❌ ACCESS DENIED!");
                        println!(" User tidak memiliki role 'admin' di resource_access atau realm_access");
                        println!(" Redirecting to: {}/auth/login", state.config.app_url);
                        session.remove::<Uuid>(SESSION_USER_KEY).await?;
                        clear_oidc_flow(&session).await?;
                        return Ok(Redirect::to(&format!("{}/login?error=unauthorized", state.config.app_url)));
                    }
                    
                    println!("✅ ACCESS GRANTED - User memiliki role admin");
                }
                // ============================================================


                println!("------------------------------------------------------------\n");
            }
        }
    }
    // ============================================================



    let user = upsert_user(&state.pool, claims).await?;
    session.insert(SESSION_USER_KEY, user.id).await?;
    clear_oidc_flow(&session).await?;
    session.save().await?;

    Ok(Redirect::to(&format!("{}/admin", state.config.app_url)))
}

pub async fn logout(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Redirect {
    
    let _ = session.flush().await;
    
    
    let keycloak_logout_url = format!(
        "{}/protocol/openid-connect/logout?redirect_uri={}/",
        state.config.oidc_issuer_url,  // https://account.maja.id/auth/realms/maja
        state.config.app_url           // http://localhost:3000
    );
    
    tracing::info!("Logging out, redirecting to Keycloak");
    Redirect::to(&keycloak_logout_url)
}


/// GET /auth/me — current session user (frontend `/admin` guard probe).
pub async fn me(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Result<Json<Value>, AppError> {
    let user_id: Option<Uuid> = session.get(SESSION_USER_KEY).await?;
    match user_id {
        Some(id) => {
            let user = find_user(&state.pool, id).await?;
            Ok(Json(json!({
                "authenticated": true,
                "user": user,
            })))
        }
        None => Ok(Json(json!({ "authenticated": false }))),
    }
}

