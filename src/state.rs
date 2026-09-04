use sqlx::PgPool;

use crate::{auth::OidcClient, config::Config, maja::MajaClient};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub oidc: OidcClient,
    pub maja: MajaClient,
    pub config: Config,
}