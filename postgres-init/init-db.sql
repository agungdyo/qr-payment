-- Create keycloak database for Keycloak service
-- This script runs automatically when PostgreSQL container is first created

-- Check if keycloak database exists, if not create it
SELECT 'CREATE DATABASE keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec