-- 001_core: the platform layer every app trusts.
--
-- Who is who:
--   core.users.platform_role
--     admin   – runs the platform (manages people, grants app access)
--     creator – family member who creates and curates (password or magic link)
--     member  – invited collaborator (magic link only; no password)
--   Guests, outside contributors and public viewers are NOT users. Each app
--   models them in its own schema (e.g. events.guests), scoped to one object.
--
-- App access is a separate axis: core.user_app_roles says who may open which
-- app. Sensitive apps are never implied by platform_role, not even for admin.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS core;
-- Each app owns its own schema; tables arrive with that app's migrations.
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS rp;

CREATE TABLE core.users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE CHECK (email LIKE '%_@_%.%'),
  display_name   text   NOT NULL CHECK (length(trim(display_name)) > 0),
  platform_role  text   NOT NULL DEFAULT 'member' CHECK (platform_role IN ('admin', 'creator', 'member')),
  password_hash  text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES core.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz,
  -- Members sign in by emailed link only.
  CONSTRAINT members_have_no_password CHECK (platform_role <> 'member' OR password_hash IS NULL)
);

-- A family is the "family only" audience. One to start, more if needed.
CREATE TABLE core.families (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.family_members (
  family_id  uuid NOT NULL REFERENCES core.families(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

CREATE TABLE core.apps (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9-]*$'),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  path        text NOT NULL UNIQUE CHECK (path ~ '^/[a-z0-9-]+$'),
  -- Sensitive apps are invisible without an explicit grant (no admin override).
  sensitive   boolean NOT NULL DEFAULT false,
  is_enabled  boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 100
);

CREATE TABLE core.user_app_roles (
  user_id    uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  app_key    text NOT NULL REFERENCES core.apps(key) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  granted_by uuid REFERENCES core.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_key)
);

-- Opaque session tokens; only the sha256 is stored. Revoking a row ends the
-- session on the next request.
CREATE TABLE core.sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  user_agent   text,
  ip           text
);
CREATE INDEX sessions_user_idx ON core.sessions (user_id) WHERE revoked_at IS NULL;

-- Single-use emailed links (sign-in and invitations).
CREATE TABLE core.login_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  purpose    text NOT NULL CHECK (purpose IN ('login', 'invite')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX login_tokens_user_idx ON core.login_tokens (user_id) WHERE used_at IS NULL;

CREATE TABLE core.audit_log (
  id       bigserial PRIMARY KEY,
  actor_id uuid REFERENCES core.users(id) ON DELETE SET NULL,
  action   text NOT NULL,
  target   text,
  detail   jsonb NOT NULL DEFAULT '{}'::jsonb,
  at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO core.apps (key, name, description, path, sensitive, is_enabled, sort_order) VALUES
  ('events',  'Events',  'Invitations, photo sharing and published pages for family occasions.', '/events', false, true, 10),
  ('couples', 'Couples', 'Private space for two.', '/couples', true, false, 90);
