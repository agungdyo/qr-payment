use std::{collections::HashSet, sync::Arc};

use anyhow::Result;
use axum::{
    extract::{FromRequestParts, Query, State},
    http::request::Parts,
    response::{IntoResponse, Redirect, Response},
    Json,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use openidconnect::{
    core::{CoreClient, CoreProviderMetadata, CoreResponseType},
    reqwest, AccessToken, AuthenticationFlow, AuthorizationCode, ClientId, ClientSecret,
    CsrfToken, EndpointMaybeSet, EndpointNotSet, EndpointSet, IssuerUrl, Nonce,
    OAuth2TokenResponse, RedirectUrl, RefreshToken, Scope,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use time::Duration;
use tokio::sync::OnceCell;
use url::Url;
use uuid::Uuid;

use crate::{config::Config, error::AppError, models::User, state::AppState};

const STATE_COOKIE: &str = "qr-payment.oauth_state";
const REFRESH_COOKIE: &str = "qr-payment.refresh";
const ID_TOKEN_COOKIE: &str = "qr-payment.id_token";
const STATE_MAX_AGE_SECS: i64 = 600;

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

/// Endpoints the crate does not model in `CoreProviderMetadata`.
#[derive(Debug, Clone)]
pub struct ProviderEndpoints {
    pub userinfo: Url,
    pub end_session: Url,
}

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
    endpoints: Arc<OnceCell<Arc<ProviderEndpoints>>>,
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
            endpoints: Arc::new(OnceCell::new()),
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

    /// Userinfo and end-session endpoints, read from the discovery document.
    pub async fn endpoints(&self) -> Result<Arc<ProviderEndpoints>> {
        let endpoints = self
            .endpoints
            .get_or_try_init(|| async {
                let url = format!(
                    "{}/.well-known/openid-configuration",
                    self.issuer.trim_end_matches('/')
                );
                let document: Value = self
                    .http
                    .get(url)
                    .send()
                    .await?
                    .error_for_status()?
                    .json()
                    .await?;
                let userinfo = document
                    .get("userinfo_endpoint")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow::anyhow!("provider has no userinfo_endpoint"))?;
                let end_session = document
                    .get("end_session_endpoint")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow::anyhow!("provider has no end_session_endpoint"))?;
                Ok::<_, anyhow::Error>(Arc::new(ProviderEndpoints {
                    userinfo: Url::parse(userinfo)?,
                    end_session: Url::parse(end_session)?,
                }))
            })
            .await?;
        Ok(endpoints.clone())
    }

    /// HTTP client used for token exchange, userinfo, and refresh.
    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }
}

pub struct AuthStart {
    pub url: Url,
    pub csrf: String,
    pub nonce: String,
}

/// Build the authorization URL (code flow) for a fresh login attempt.
pub async fn start_login(oidc: &OidcClient) -> Result<AuthStart> {
    let client = oidc.client().await?;
    let (url, csrf, nonce) = client
        .authorize_url(
            AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_scope(Scope::new("offline_access".to_string()))
        .url();
    Ok(AuthStart {
        url,
        csrf: csrf.secret().to_string(),
        nonce: nonce.secret().to_string(),
    })
}

/// Identity taken from the Keycloak userinfo endpoint.
pub struct KeycloakProfile {
    pub sub: String,
    pub username: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub roles: Vec<String>,
}

pub struct LoginOutcome {
    pub user: User,
    pub id_token: Option<String>,
    pub refresh_token: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct FlowState {
    state: String,
    nonce: String,
    return_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Claims {
    pub sub: String,
    pub keycloak_id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub roles: Vec<String>,
    pub is_admin: bool,
    pub iat: usize,
    pub exp: usize,
}

/// Serialize a claim set for the frontend. The guard still reads roles from the
/// database, so a revoked Keycloak role cannot stay alive in a stale token.
fn user_json(user: &User) -> Value {
    json!({
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "username": user.username,
        "roles": user.keycloak_roles,
        "isAdmin": user.is_admin,
        "createdAt": user.created_at,
        "lastLogin": user.last_login,
    })
}

fn issue_jwt(config: &Config, user: &User) -> Result<String, AppError> {
    let now = Utc::now().timestamp() as usize;
    let claims = Claims {
        sub: user.id.to_string(),
        keycloak_id: user.keycloak_sub.clone(),
        email: user.email.clone(),
        name: user.name.clone(),
        roles: user.keycloak_roles.clone(),
        is_admin: user.is_admin,
        iat: now,
        exp: now + config.jwt_expires_secs as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encode: {e}")))
}

fn decode_jwt(config: &Config, token: &str) -> Result<Claims, AppError> {
    let validation = Validation::new(Algorithm::HS256);
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|error| {
        tracing::warn!(%error, "JWT validation failed");
        AppError::Unauthorized
    })
}

const USER_COLUMNS: &str = "id, keycloak_sub, username, name, email, keycloak_roles, is_admin, last_login, created_at, updated_at";

/// Look up a user by primary key.
pub async fn find_user(pool: &sqlx::PgPool, user_id: Uuid) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(&format!(
        "SELECT {USER_COLUMNS} FROM users WHERE id = $1"
    ))
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    Ok(user)
}

/// Look up a user by Keycloak `sub` (used by the refresh flow).
pub async fn find_user_by_sub(pool: &sqlx::PgPool, sub: &str) -> Result<Option<User>, AppError> {
    let user = sqlx::query_as::<_, User>(&format!(
        "SELECT {USER_COLUMNS} FROM users WHERE keycloak_sub = $1"
    ))
    .bind(sub)
    .fetch_optional(pool)
    .await?;
    Ok(user)
}

/// Upsert the user from Keycloak userinfo and return the stored row.
pub async fn upsert_user(
    pool: &sqlx::PgPool,
    profile: &KeycloakProfile,
) -> Result<User, AppError> {
    let is_admin = profile.roles.iter().any(|role| is_admin_role(role));
    let roles = json!(profile.roles);
    let user = sqlx::query_as::<_, User>(&format!(
        r#"
        INSERT INTO users (keycloak_sub, username, email, name, keycloak_roles, is_admin, last_login)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (keycloak_sub) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            keycloak_roles = EXCLUDED.keycloak_roles,
            is_admin = EXCLUDED.is_admin,
            last_login = now(),
            updated_at = now()
        RETURNING {USER_COLUMNS}
        "#
    ))
    .bind(&profile.sub)
    .bind(&profile.username)
    .bind(&profile.email)
    .bind(&profile.name)
    .bind(roles)
    .bind(is_admin)
    .fetch_one(pool)
    .await?;
    Ok(user)
}

/// Refresh hanya boleh memperbarui user yang sudah ada; kalau user dihapus dari
/// aplikasi, refresh tidak boleh membuatnya kembali.
async fn sync_user_roles(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    roles: &[String],
) -> Result<User, AppError> {
    let is_admin = roles.iter().any(|role| is_admin_role(role));
    let roles = json!(roles);
    let user = sqlx::query_as::<_, User>(&format!(
        "UPDATE users SET keycloak_roles = $2, is_admin = $3, updated_at = now() \
         WHERE id = $1 RETURNING {USER_COLUMNS}"
    ))
    .bind(user_id)
    .bind(roles)
    .bind(is_admin)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    Ok(user)
}

/// Query parameters on the OIDC callback.
#[derive(serde::Deserialize)]
pub struct CallbackParams {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct LoginParams {
    #[serde(rename = "returnUrl", alias = "return_url")]
    pub return_url: Option<String>,
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

fn cookie(name: &str, value: String, path: &str, max_age: i64, secure: bool) -> Cookie<'static> {
    Cookie::build((name.to_string(), value))
        .path(path.to_string())
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(secure)
        .max_age(Duration::seconds(max_age))
        .build()
}

fn clear_cookie(jar: CookieJar, name: &str, path: &str, secure: bool) -> CookieJar {
    jar.add(
        Cookie::build((name.to_string(), String::new()))
            .path(path.to_string())
            .http_only(true)
            .same_site(SameSite::Lax)
            .secure(secure)
            .max_age(Duration::seconds(0))
            .build(),
    )
}

fn clear_auth_cookies(jar: CookieJar, config: &Config) -> CookieJar {
    let jar = clear_cookie(jar, &config.session_cookie_name, "/", config.session_secure);
    let jar = clear_cookie(jar, REFRESH_COOKIE, "/api/auth", config.session_secure);
    clear_cookie(jar, ID_TOKEN_COOKIE, "/", config.session_secure)
}

fn apply_session_cookies(
    jar: CookieJar,
    config: &Config,
    jwt: &str,
    id_token: Option<&str>,
    refresh_token: Option<&str>,
) -> CookieJar {
    let secure = config.session_secure;
    let mut jar = jar.add(cookie(
        &config.session_cookie_name,
        jwt.to_string(),
        "/",
        config.jwt_expires_secs as i64,
        secure,
    ));
    if let Some(id_token) = id_token {
        jar = jar.add(cookie(
            ID_TOKEN_COOKIE,
            id_token.to_string(),
            "/",
            config.jwt_expires_secs as i64,
            secure,
        ));
    }
    if let Some(refresh_token) = refresh_token {
        jar = jar.add(cookie(
            REFRESH_COOKIE,
            refresh_token.to_string(),
            "/api/auth",
            config.jwt_refresh_expires_secs as i64,
            secure,
        ));
    }
    jar
}

fn read_flow_state(jar: &CookieJar) -> Option<FlowState> {
    let raw = jar.get(STATE_COOKIE)?.value();
    let bytes = URL_SAFE_NO_PAD.decode(raw).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn login_redirect(app_url: &str, error: &str) -> Redirect {
    Redirect::to(&format!(
        "{}/login?error={}",
        app_url.trim_end_matches('/'),
        urlencoding::encode(error)
    ))
}

/// Only same-origin paths are accepted. Anything else falls back to `/admin`.
fn safe_return_url(value: Option<String>, app_url: &str) -> Option<String> {
    let value = value?;
    if value.starts_with('/') && !value.starts_with("//") {
        return Some(value);
    }
    let candidate = Url::parse(&value).ok()?;
    let base = Url::parse(app_url).ok()?;
    if candidate.origin() != base.origin() {
        return None;
    }
    let mut path = candidate.path().to_string();
    if let Some(query) = candidate.query() {
        path.push('?');
        path.push_str(query);
    }
    Some(path)
}

fn redirect_after_login(config: &Config, return_url: Option<String>) -> Redirect {
    let base = config.app_url.trim_end_matches('/');
    match return_url {
        Some(path) => Redirect::to(&format!("{base}{path}")),
        None => Redirect::to(&format!("{base}/admin")),
    }
}

fn oidc_error(error: impl std::fmt::Display) -> AppError {
    AppError::Internal(anyhow::anyhow!("OIDC: {error}"))
}

fn push_role(roles: &mut Vec<String>, seen: &mut HashSet<String>, role: &str) {
    if seen.insert(role.to_string()) {
        roles.push(role.to_string());
    }
}

/// Realm ini memakai `ADMINISTRATOR`; client uiadv memakai `admin`.
fn is_admin_role(role: &str) -> bool {
    role.eq_ignore_ascii_case("admin") || role.eq_ignore_ascii_case("administrator")
}

fn merge_roles(roles: &mut Vec<String>, extra: impl IntoIterator<Item = String>) {
    let mut seen: HashSet<String> = roles.iter().cloned().collect();
    for role in extra {
        push_role(roles, &mut seen, &role);
    }
}

fn roles_from_claims(value: &Value) -> Vec<String> {
    let mut roles = Vec::new();
    let mut seen = HashSet::new();

    if let Some(items) = value
        .pointer("/realm_access/roles")
        .and_then(Value::as_array)
    {
        for role in items.iter().filter_map(Value::as_str) {
            push_role(&mut roles, &mut seen, role);
        }
    }

    if let Some(clients) = value.get("resource_access").and_then(Value::as_object) {
        for client in clients.values() {
            if let Some(items) = client.get("roles").and_then(Value::as_array) {
                for role in items.iter().filter_map(Value::as_str) {
                    push_role(&mut roles, &mut seen, role);
                }
            }
        }
    }

    roles
}

/// Keycloak menaruh `realm_access`/`resource_access` di access token, bukan di
/// userinfo (kecuali client menambahkan mapper userinfo). Token ini diterima
/// langsung dari token endpoint lewat TLS, jadi payload-nya boleh dibaca tanpa
/// verifikasi signature.
fn roles_from_access_token(token: &str) -> Vec<String> {
    let Some(payload) = token.split('.').nth(1) else {
        return Vec::new();
    };
    let payload = payload.trim_end_matches('=');
    let Ok(bytes) = URL_SAFE_NO_PAD.decode(payload) else {
        tracing::warn!("access token payload is not base64url");
        return Vec::new();
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        tracing::warn!("access token payload is not JSON");
        return Vec::new();
    };
    roles_from_claims(&value)
}

fn profile_from_userinfo(value: Value, token_roles: &[String]) -> Option<KeycloakProfile> {
    let sub = value.get("sub")?.as_str()?.to_string();
    let email = value
        .get("email")
        .and_then(Value::as_str)
        .map(str::to_string);
    let username = value
        .get("preferred_username")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| email.clone())
        .unwrap_or_else(|| "user".to_string());
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| Some(username.clone()));
    let mut roles = roles_from_claims(&value);
    merge_roles(&mut roles, token_roles.iter().cloned());

    Some(KeycloakProfile {
        sub,
        username,
        email,
        name,
        roles,
    })
}

async fn fetch_userinfo(oidc: &OidcClient, access_token: &str) -> Result<KeycloakProfile, AppError> {
    let token_roles = roles_from_access_token(access_token);
    let endpoints = oidc.endpoints().await.map_err(oidc_error)?;
    let response = oidc
        .http()
        .get(endpoints.userinfo.clone())
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(AppError::from)?;
    if !response.status().is_success() {
        tracing::warn!(status = %response.status(), "userinfo request rejected");
        return Err(AppError::Unauthorized);
    }
    let value: Value = response.json().await.map_err(AppError::from)?;
    let profile = profile_from_userinfo(value, &token_roles).ok_or(AppError::Unauthorized)?;
    tracing::info!(
        username = %profile.username,
        roles = ?profile.roles,
        "resolved Keycloak identity"
    );
    Ok(profile)
}

async fn complete_login(
    state: &AppState,
    flow: &FlowState,
    code: String,
) -> Result<LoginOutcome, AppError> {
    let client = state.oidc.client().await.map_err(oidc_error)?;
    let request = client
        .exchange_code(AuthorizationCode::new(code))
        .map_err(oidc_error)?;
    let token_response = request
        .request_async(state.oidc.http())
        .await
        .map_err(oidc_error)?;

    let id_token = token_response
        .extra_fields()
        .id_token()
        .ok_or_else(|| AppError::bad_request("server did not return an ID token"))?;
    id_token
        .claims(&client.id_token_verifier(), &Nonce::new(flow.nonce.clone()))
        .map_err(oidc_error)?;
    let id_token_string = id_token.to_string();

    let access_token: &AccessToken = token_response.access_token();
    let refresh_token = token_response
        .refresh_token()
        .map(|token| token.secret().to_string());
    let profile = fetch_userinfo(&state.oidc, access_token.secret()).await?;
    let user = upsert_user(&state.pool, &profile).await?;

    Ok(LoginOutcome {
        user,
        id_token: Some(id_token_string),
        refresh_token,
    })
}

async fn refresh_session(state: &AppState, refresh_token: String) -> Result<LoginOutcome, AppError> {
    let client = state.oidc.client().await.map_err(oidc_error)?;
    let refresh_token = RefreshToken::new(refresh_token);
    let request = client
        .exchange_refresh_token(&refresh_token)
        .map_err(oidc_error)?;
    let token_response = request
        .request_async(state.oidc.http())
        .await
        .map_err(oidc_error)?;

    let access_token = token_response.access_token();
    let id_token = token_response
        .extra_fields()
        .id_token()
        .map(|token| token.to_string());
    let next_refresh_token = token_response
        .refresh_token()
        .map(|token| token.secret().to_string());

    let profile = fetch_userinfo(&state.oidc, access_token.secret()).await?;
    let user = find_user_by_sub(&state.pool, &profile.sub)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let user = sync_user_roles(&state.pool, user.id, &profile.roles).await?;

    Ok(LoginOutcome {
        user,
        id_token,
        refresh_token: next_refresh_token,
    })
}

/// GET /api/auth/login, start the authorization code flow.
pub async fn login(
    State(state): State<AppState>,
    Query(params): Query<LoginParams>,
    jar: CookieJar,
) -> Result<(CookieJar, Redirect), AppError> {
    let start = start_login(&state.oidc).await.map_err(oidc_error)?;
    let flow = FlowState {
        state: start.csrf,
        nonce: start.nonce,
        return_url: safe_return_url(params.return_url, &state.config.app_url),
    };
    let encoded = URL_SAFE_NO_PAD.encode(
        serde_json::to_vec(&flow)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("state encode: {e}")))?,
    );
    let jar = jar.add(cookie(
        STATE_COOKIE,
        encoded,
        "/",
        STATE_MAX_AGE_SECS,
        state.config.session_secure,
    ));
    Ok((jar, Redirect::to(start.url.as_str())))
}

/// GET /api/auth/callback, exchange the code, sync the user, set cookies.
pub async fn callback(
    State(state): State<AppState>,
    Query(params): Query<CallbackParams>,
    jar: CookieJar,
) -> (CookieJar, Redirect) {
    let stored = read_flow_state(&jar);
    let jar = clear_cookie(
        jar,
        STATE_COOKIE,
        "/",
        state.config.session_secure,
    );

    let flow = match stored {
        Some(flow) => flow,
        None => {
            tracing::warn!("OIDC callback without a state cookie");
            return (jar, login_redirect(&state.config.app_url, "state_mismatch"));
        }
    };

    match params.state.as_deref() {
        Some(value) if ct_eq(value, &flow.state) => {}
        _ => {
            tracing::warn!("OIDC callback state mismatch");
            return (jar, login_redirect(&state.config.app_url, "state_mismatch"));
        }
    }

    if let Some(error) = params.error.as_deref() {
        tracing::warn!(error, "Keycloak returned an error");
        return (jar, login_redirect(&state.config.app_url, error));
    }

    let code = match params.code {
        Some(code) => code,
        None => {
            tracing::warn!("OIDC callback without an authorization code");
            return (jar, login_redirect(&state.config.app_url, "no_code"));
        }
    };

    let outcome = match complete_login(&state, &flow, code).await {
        Ok(outcome) => outcome,
        Err(error) => {
            tracing::warn!(?error, "login failed");
            return (jar, login_redirect(&state.config.app_url, "auth_failed"));
        }
    };

    let jwt = match issue_jwt(&state.config, &outcome.user) {
        Ok(jwt) => jwt,
        Err(error) => {
            tracing::error!(?error, "JWT encode failed");
            return (jar, login_redirect(&state.config.app_url, "auth_failed"));
        }
    };

    let jar = apply_session_cookies(
        jar,
        &state.config,
        &jwt,
        outcome.id_token.as_deref(),
        outcome.refresh_token.as_deref(),
    );
    (
        jar,
        redirect_after_login(&state.config, flow.return_url),
    )
}

/// POST /api/auth/refresh, rotate the Keycloak session and app JWT.
pub async fn refresh(State(state): State<AppState>, jar: CookieJar) -> Response {
    let refresh_token = match jar.get(REFRESH_COOKIE) {
        Some(cookie) => cookie.value().to_string(),
        None => {
            return (jar, AppError::Unauthorized).into_response();
        }
    };

    let outcome = match refresh_session(&state, refresh_token).await {
        Ok(outcome) => outcome,
        Err(error) => {
            tracing::warn!(?error, "token refresh failed");
            let jar = clear_auth_cookies(jar, &state.config);
            return (jar, AppError::Unauthorized).into_response();
        }
    };

    let jwt = match issue_jwt(&state.config, &outcome.user) {
        Ok(jwt) => jwt,
        Err(error) => {
            tracing::error!(?error, "JWT encode failed");
            return error.into_response();
        }
    };

    let jar = apply_session_cookies(
        jar,
        &state.config,
        &jwt,
        outcome.id_token.as_deref(),
        outcome.refresh_token.as_deref(),
    );
    (jar, Json(json!({ "success": true, "user": user_json(&outcome.user) }))).into_response()
}

/// GET|POST /api/auth/logout, clear local cookies and end the Keycloak session.
pub async fn logout(State(state): State<AppState>, jar: CookieJar) -> (CookieJar, Redirect) {
    let id_token = jar
        .get(ID_TOKEN_COOKIE)
        .map(|cookie| cookie.value().to_string());
    let jar = clear_auth_cookies(jar, &state.config);

    let target = logout_url(&state, id_token.as_deref())
        .await
        .unwrap_or_else(|| state.config.app_url.clone());
    (jar, Redirect::to(&target))
}

async fn logout_url(state: &AppState, id_token: Option<&str>) -> Option<String> {
    let endpoints = state.oidc.endpoints().await.ok()?;
    let mut url = endpoints.end_session.clone();
    {
        let mut pairs = url.query_pairs_mut();
        if let Some(id_token) = id_token {
            pairs.append_pair("id_token_hint", id_token);
        }
        pairs.append_pair(
            "post_logout_redirect_uri",
            &state.config.keycloak_post_logout_uri,
        );
        pairs.append_pair("client_id", &state.config.keycloak_client_id);
    }
    Some(url.to_string())
}

/// GET /api/auth/me, current user.
pub async fn me(auth: AuthUser) -> Json<Value> {
    Json(user_json(&auth.0))
}

/// GET /api/auth/check, always 200.
pub async fn check(auth: MaybeAuth) -> Json<Value> {
    match auth.0 {
        Some(user) => Json(json!({ "authenticated": true, "user": user_json(&user) })),
        None => Json(json!({ "authenticated": false, "user": null })),
    }
}

/// Extractor for endpoints that require a logged-in user.
pub struct AuthUser(pub User);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthorized)?;
        let token = jar
            .get(&state.config.session_cookie_name)
            .map(|cookie| cookie.value().to_string())
            .ok_or(AppError::Unauthorized)?;
        let claims = decode_jwt(&state.config, &token)?;
        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
        let user = find_user(&state.pool, user_id).await?;
        Ok(AuthUser(user))
    }
}

/// Extractor for endpoints that respond whether or not the user is logged in.
pub struct MaybeAuth(pub Option<User>);

impl FromRequestParts<AppState> for MaybeAuth {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        match AuthUser::from_request_parts(parts, state).await {
            Ok(AuthUser(user)) => Ok(MaybeAuth(Some(user))),
            Err(_) => Ok(MaybeAuth(None)),
        }
    }
}

/// Extractor for admin endpoints: login plus the `admin` role.
pub struct AdminAuth;

impl FromRequestParts<AppState> for AdminAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        if !user.is_admin && !user.keycloak_roles.iter().any(|role| is_admin_role(role)) {
            return Err(AppError::Forbidden);
        }
        Ok(AdminAuth)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_roles_are_case_insensitive() {
        assert!(is_admin_role("admin"));
        assert!(is_admin_role("ADMINISTRATOR"));
        assert!(is_admin_role("Administrator"));
        assert!(!is_admin_role("USER_TIER_1"));
    }

    #[test]
    fn extracts_roles_from_access_token_payload() {
        let payload = json!({
            "realm_access": {"roles": ["default-roles-uipod.id", "USER_TIER_1", "ADMINISTRATOR"]},
            "resource_access": {"uiadv-competition-web": {"roles": ["admin", "ADMINISTRATOR"]}}
        });
        let encoded = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let token = format!("header.{encoded}.signature");

        let roles = roles_from_access_token(&token);
        assert_eq!(
            roles,
            vec!["default-roles-uipod.id", "USER_TIER_1", "ADMINISTRATOR", "admin"]
        );
    }

    #[test]
    fn malformed_access_token_has_no_roles() {
        assert!(roles_from_access_token("not-a-jwt").is_empty());
    }
}
