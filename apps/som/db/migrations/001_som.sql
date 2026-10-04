-- S-O-M: a private scene app for couples (and small pods), on its own
-- database. Everything people write or upload is encrypted on their phones
-- before it arrives (lib/crypto.ts): the *_enc columns and the bucket hold
-- only ciphertext. What's readable here is who, when and status, which the
-- server needs to route notifications and enforce who may do what.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA som;

CREATE TABLE som.accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      citext NOT NULL UNIQUE CHECK (username::text ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  display_name  text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 60),
  password_hash text,
  is_admin      boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES som.accounts(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE som.logins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES som.accounts(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX ON som.logins (account_id);

CREATE TABLE som.pods (
  id          uuid PRIMARY KEY,
  created_by  uuid NOT NULL REFERENCES som.accounts(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Encrypted: the pod's name and titles, and its menu.
  settings_enc text NOT NULL,
  menu_enc     text NOT NULL,
  menu_rev     integer NOT NULL DEFAULT 1
);

CREATE TABLE som.members (
  pod_id     uuid NOT NULL REFERENCES som.pods(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES som.accounts(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('lead', 'follow')),
  -- The pod key wrapped with this member's vault passphrase, for new phones.
  key_backup jsonb,
  -- The pod key wrapped with a one-time secret that only travels in the
  -- invite link's #fragment. Cleared once they've set a passphrase.
  invite     jsonb,
  added_by   uuid REFERENCES som.accounts(id),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pod_id, account_id)
);
CREATE INDEX ON som.members (account_id);

CREATE TABLE som.scenes (
  id              uuid PRIMARY KEY,
  pod_id          uuid NOT NULL REFERENCES som.pods(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES som.accounts(id),
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'proposed', 'active', 'inspection', 'aftercare', 'closed')),
  plan_enc        text NOT NULL,
  plan_rev        integer NOT NULL DEFAULT 1,
  checkin_minutes integer CHECK (checkin_minutes BETWEEN 5 AND 600),
  checkin_grace   integer NOT NULL DEFAULT 10 CHECK (checkin_grace BETWEEN 1 AND 120),
  next_checkin_at timestamptz,
  arrival_at      timestamptz,
  paused_at       timestamptz,
  paused_by       uuid REFERENCES som.accounts(id),
  started_at      timestamptz,
  closed_at       timestamptz,
  close_votes     uuid[] NOT NULL DEFAULT '{}',
  delete_votes    uuid[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON som.scenes (pod_id, created_at DESC);

CREATE TABLE som.tasks (
  id           uuid PRIMARY KEY,
  scene_id     uuid NOT NULL REFERENCES som.scenes(id) ON DELETE CASCADE,
  ord          integer NOT NULL,
  status       text NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'started', 'submitted', 'returned', 'approved', 'skipped')),
  body_enc     text NOT NULL,
  -- A countdown's length, in the clear so the server can send the reminder.
  minutes      integer CHECK (minutes BETWEEN 1 AND 1440),
  due_at       timestamptz,
  started_at   timestamptz,
  submitted_at timestamptz,
  decided_at   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON som.tasks (scene_id, ord);

CREATE TABLE som.entries (
  id         uuid PRIMARY KEY,
  scene_id   uuid NOT NULL REFERENCES som.scenes(id) ON DELETE CASCADE,
  task_id    uuid REFERENCES som.tasks(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES som.accounts(id),
  kind       text NOT NULL CHECK (kind IN ('comment', 'writing', 'checkin', 'scores', 'outcomes', 'aftercare', 'reflection')),
  body_enc   text NOT NULL,
  -- Reflections can be kept to yourself.
  private    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON som.entries (scene_id, created_at);

CREATE TABLE som.media (
  id           uuid PRIMARY KEY,
  scene_id     uuid NOT NULL REFERENCES som.scenes(id) ON DELETE CASCADE,
  task_id      uuid REFERENCES som.tasks(id) ON DELETE SET NULL,
  entry_id     uuid REFERENCES som.entries(id) ON DELETE SET NULL,
  uploader_id  uuid NOT NULL REFERENCES som.accounts(id),
  object_key   text NOT NULL UNIQUE,
  thumb_key    text UNIQUE,
  bytes        bigint NOT NULL CHECK (bytes > 0),
  thumb_bytes  integer,
  chunk_bytes  integer NOT NULL CHECK (chunk_bytes BETWEEN 1024 AND 67108864),
  file_key_enc text NOT NULL,
  nonce        text NOT NULL,
  thumb_nonce  text,
  meta_enc     text NOT NULL,
  upload_id    text,
  status       text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON som.media (scene_id);

-- Reminders the server sends: check-ins, countdowns, arrivals.
CREATE TABLE som.timers (
  id           bigserial PRIMARY KEY,
  scene_id     uuid NOT NULL REFERENCES som.scenes(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('checkin_due', 'checkin_overdue', 'task_due', 'arrival_soon', 'arrival')),
  task_id      uuid REFERENCES som.tasks(id) ON DELETE CASCADE,
  fire_at      timestamptz NOT NULL,
  fired_at     timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX ON som.timers (fire_at) WHERE fired_at IS NULL AND cancelled_at IS NULL;

CREATE TABLE som.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES som.accounts(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);

CREATE TABLE som.settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Account events only (sign-ins, people added, passwords reset); no
-- addresses or devices, and nothing about what's in a scene.
CREATE TABLE som.audit_log (
  id         bigserial PRIMARY KEY,
  account_id uuid REFERENCES som.accounts(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target     text,
  at         timestamptz NOT NULL DEFAULT now()
);
