use anyhow::{Context, Result};
use urlencoding::encode;

/// Application configuration, loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    /// Whether to run sqlx migrations automatically on startup (default: true).
    pub auto_migrate: bool,
    pub port: u16,
    /// Frontend origin, used for post-login redirects.
    pub app_url: String,
    /// Frontend origin allowed by CORS (defaults to `app_url`).
    pub app_frontend_url: String,
    pub keycloak_issuer_url: String,
    pub keycloak_client_id: String,
    pub keycloak_client_secret: String,
    pub keycloak_redirect_uri: String,
    pub keycloak_post_logout_uri: String,
    pub jwt_secret: String,
    pub jwt_expires_secs: u64,
    pub jwt_refresh_expires_secs: u64,
    pub session_cookie_name: String,
    /// Whether cookies require HTTPS (disable for local dev).
    pub session_secure: bool,
    // --- MAJA H2H (billing gateway) ---
    pub maja_token_url: String,
    pub maja_base_url: String,
    /// Optional, payment endpoints return 503 until credentials are provided.
    pub maja_username: Option<String>,
    pub maja_password: Option<String>,
    pub maja_client_id: Option<String>,
    pub maja_client_secret: Option<String>,
    /// Default customer email used when registering MAJA invoices (walk-in).
    pub maja_customer_email: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let base_url =
            std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
        let app_url = std::env::var("APP_URL").unwrap_or_else(|_| "http://localhost:5173".to_string());

        let database_url = match opt_env("DATABASE_URL") {
            Some(url) => url,
            None => {
                let host = env("DATABASE_HOST")?;
                let name = env("DATABASE_NAME")?;
                let user = env("DATABASE_USER")?;
                let port = match std::env::var("DATABASE_PORT").ok().filter(|s| !s.trim().is_empty()) {
                    Some(p) => p
                        .parse::<u16>()
                        .context("DATABASE_PORT must be a valid port number (1-65535)")?,
                    None => 5434,
                };
                let password = opt_env("DATABASE_PASSWORD");
                build_database_url(&host, port, &name, &user, password.as_deref())
            }
        };

        Ok(Config {
            database_url,
            auto_migrate: std::env::var("AUTO_MIGRATE")
                .map(|v| v != "0" && !v.eq_ignore_ascii_case("false"))
                .unwrap_or(true),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            keycloak_redirect_uri: std::env::var("KEYCLOAK_REDIRECT_URI")
                .unwrap_or_else(|_| format!("{base_url}/api/auth/callback")),
            keycloak_post_logout_uri: std::env::var("KEYCLOAK_POST_LOGOUT_URI")
                .unwrap_or_else(|_| app_url.clone()),
            app_frontend_url: std::env::var("APP_FRONTEND_URL")
                .unwrap_or_else(|_| app_url.clone()),
            app_url,
            keycloak_issuer_url: env("KEYCLOAK_ISSUER_URL")?,
            keycloak_client_id: env("KEYCLOAK_CLIENT_ID")?,
            keycloak_client_secret: env("KEYCLOAK_CLIENT_SECRET")?,
            jwt_secret: env("JWT_SECRET")?,
            jwt_expires_secs: duration_env("JWT_EXPIRES_IN", 3600),
            jwt_refresh_expires_secs: duration_env("JWT_REFRESH_EXPIRES_IN", 7 * 24 * 3600),
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
}

fn env(key: &str) -> Result<String> {
    std::env::var(key)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .with_context(|| format!("{key} must be set"))
}

fn opt_env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|s| !s.is_empty())
}

/// Duration in seconds from `3600`, `60s`, `15m`, `1h`, or `7d`.
fn duration_env(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| parse_duration(&v))
        .unwrap_or(default)
}

fn parse_duration(value: &str) -> Option<u64> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let (number, multiplier) = match value.chars().last()? {
        's' => (&value[..value.len() - 1], 1),
        'm' => (&value[..value.len() - 1], 60),
        'h' => (&value[..value.len() - 1], 3600),
        'd' => (&value[..value.len() - 1], 86400),
        _ => (value, 1),
    };
    number.parse::<u64>().ok().map(|n| n * multiplier)
}

fn build_database_url(
    host: &str,
    port: u16,
    name: &str,
    user: &str,
    password: Option<&str>,
) -> String {
    let auth = match password {
        Some(pass) if !pass.is_empty() => {
            format!("{}:{}@", encode(user), encode(pass))
        }
        _ => format!("{}@", encode(user)),
    };
    format!("postgres://{auth}{host}:{port}/{name}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_database_url_normal() {
        let url = build_database_url(
            "localhost",
            5434,
            "qrpayment",
            "qrpayment",
            Some("secret123"),
        );
        assert_eq!(
            url,
            "postgres://qrpayment:secret123@localhost:5434/qrpayment"
        );
    }

    #[test]
    fn test_build_database_url_special_chars() {
        let url = build_database_url(
            "10.0.0.1",
            5432,
            "mydb",
            "user@domain",
            Some("p@ss/word%#&"),
        );
        assert_eq!(
            url,
            "postgres://user%40domain:p%40ss%2Fword%25%23%26@10.0.0.1:5432/mydb"
        );
    }

    #[test]
    fn test_build_database_url_no_password() {
        let url = build_database_url("localhost", 5434, "qrpayment", "postgres", None);
        assert_eq!(url, "postgres://postgres@localhost:5434/qrpayment");

        let url_empty = build_database_url("localhost", 5434, "qrpayment", "postgres", Some(""));
        assert_eq!(url_empty, "postgres://postgres@localhost:5434/qrpayment");
    }
}
