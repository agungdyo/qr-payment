use anyhow::{Context, Result};

/// Application configuration, loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    /// Backend origin, used to build the OIDC redirect URI.
    pub base_url: String,
    /// Frontend origin, used for post-login redirects.
    pub app_url: String,
    pub oidc_issuer_url: String,
    pub oidc_client_id: String,
    pub oidc_client_secret: String,
    pub session_cookie_name: String,
    /// Whether the session cookie requires HTTPS (disable for local dev).
    pub session_secure: bool,
    // --- MAJA H2H (billing gateway) ---
    pub maja_token_url: String,
    pub maja_base_url: String,
    /// Optional — payment endpoints return 503 until credentials are provided.
    pub maja_username: Option<String>,
    pub maja_password: Option<String>,
    pub maja_client_id: Option<String>,
    pub maja_client_secret: Option<String>,
    /// Default customer email used when registering MAJA invoices (walk-in).
    pub maja_customer_email: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Config {
            database_url: env("DATABASE_URL")?,
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            base_url: std::env::var("BASE_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            app_url: std::env::var("APP_URL").unwrap_or_else(|_| "http://localhost:5173".to_string()),
            oidc_issuer_url: env("OIDC_ISSUER_URL")?,
            oidc_client_id: env("OIDC_CLIENT_ID")?,
            oidc_client_secret: env("OIDC_CLIENT_SECRET")?,
            session_cookie_name: std::env::var("SESSION_COOKIE_NAME")
                .unwrap_or_else(|_| "qr-payment.session".to_string()),
            session_secure: std::env::var("SESSION_SECURE")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
            maja_token_url: std::env::var("MAJA_TOKEN_URL").unwrap_or_else(|_| {
                "https://account.makaramas.com/auth/realms/maja/protocol/openid-connect/token"
                    .to_string()
            }),
            maja_base_url: std::env::var("MAJA_BASE_URL")
                .unwrap_or_else(|_| "https://billing.maja.id".to_string()),
            maja_username: opt_env("MAJA_USERNAME"),
            maja_password: opt_env("MAJA_PASSWORD"),
            maja_client_id: opt_env("MAJA_CLIENT_ID"),
            maja_client_secret: opt_env("MAJA_CLIENT_SECRET"),
            maja_customer_email: std::env::var("MAJA_CUSTOMER_EMAIL")
                .unwrap_or_else(|_| "walkin@qr-payment.local".to_string()),
        })
    }

    /// The OIDC redirect URI registered in Keycloak.
    pub fn oidc_redirect_url(&self) -> String {
        format!("{}/auth/callback", self.base_url)
    }
}

fn env(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| format!("{key} must be set"))
}

fn opt_env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|s| !s.is_empty())
}