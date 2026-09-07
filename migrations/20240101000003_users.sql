-- App users synced from Keycloak OIDC ID-token claims on first login.
-- keycloak_sub = `sub` claim, the stable Keycloak user id.
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_sub TEXT NOT NULL UNIQUE,
    username     TEXT NOT NULL,
    email        TEXT,
    name         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_email ON users (email);