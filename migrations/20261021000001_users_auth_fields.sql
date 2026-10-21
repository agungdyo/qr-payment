-- Auth fields synced from Keycloak userinfo on every login.
-- keycloak_roles = realm roles + client roles, deduplicated.

ALTER TABLE users ADD COLUMN IF NOT EXISTS keycloak_roles JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
