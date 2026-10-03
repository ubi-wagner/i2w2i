-- 002_app_role: the role the web server connects as.
--
-- Migrations run as the database owner (on Railway, a superuser, which
-- ignores row-level security). The server connects as i2w2i_app instead,
-- which can't bypass RLS and only sees the schemas it's granted. Its
-- password is set at boot from APP_DB_PASSWORD (db/migrate.mjs), never here.
--
-- rp (Couples) is deliberately not granted; it gets its own access when built.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'i2w2i_app') THEN
    CREATE ROLE i2w2i_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO i2w2i_app', current_database());
END $$;

GRANT USAGE ON SCHEMA core, events TO i2w2i_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO i2w2i_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO i2w2i_app;
-- The app registry is configuration, and the audit log is append-only.
REVOKE INSERT, UPDATE, DELETE ON core.apps FROM i2w2i_app;
REVOKE UPDATE, DELETE ON core.audit_log FROM i2w2i_app;

-- Tables later migrations create in these schemas are usable by the app
-- unless a migration says otherwise.
ALTER DEFAULT PRIVILEGES IN SCHEMA core, events GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO i2w2i_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA core, events GRANT USAGE, SELECT ON SEQUENCES TO i2w2i_app;
