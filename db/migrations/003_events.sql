-- 003_events: the Events app (albums, guest uploads, chat).
--
-- Who can do what is enforced HERE, with row-level security, not just in
-- page code. The server connects as i2w2i_app (002) and, per transaction,
-- tells Postgres who is asking (lib/events/db.ts):
--
--   app.user_id    signed-in platform user, if any
--   app.is_admin   'true' for the platform admin
--   app.guest_id   guest session (code/QR holder), if any
--   app.event_id   the event that guest belongs to
--   app.can_upload / app.can_view   what the guest's access code allows
--
-- Boundary: access codes and guests (the "resolver" side) may read events;
-- events, uploads and messages never read access codes. One direction only.

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE events.events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  title        text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  starts_on    date,
  location     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  -- draft: only members see it. published: the album is visible to `audience`.
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- public: anyone with the link. family: any signed-in family member.
  -- invitees: event members plus guests whose code allows viewing.
  audience     text NOT NULL DEFAULT 'invitees' CHECK (audience IN ('public', 'family', 'invitees')),
  chat_enabled boolean NOT NULL DEFAULT true,
  created_by   uuid NOT NULL REFERENCES core.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

-- Known people on an event (platform accounts). owner/curator manage it;
-- invitees see the album, upload and chat.
CREATE TABLE events.members (
  event_id  uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  role      text NOT NULL CHECK (role IN ('owner', 'curator', 'invitee')),
  added_by  uuid REFERENCES core.users(id),
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX members_user_idx ON events.members (user_id);

-- One access record, two credentials: a typed code ("CB1106") and a QR
-- token. Lookups use keyed hashes, and each credential can be revoked on its
-- own. The typed code is also kept encrypted with APP_SECRET (code_enc) so
-- owners can print it again; the database alone reveals neither.
-- The QR token is derived from APP_SECRET + id + qr_version, so the card can
-- be re-rendered any time and reissued by bumping the version.
CREATE TABLE events.access_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  label           text NOT NULL DEFAULT '',
  code_hmac       bytea,
  code_enc        bytea,
  qr_hash         bytea UNIQUE,
  qr_version      int  NOT NULL DEFAULT 1,
  can_upload      boolean NOT NULL DEFAULT true,
  can_view        boolean NOT NULL DEFAULT true,
  code_revoked_at timestamptz,
  qr_revoked_at   timestamptz,
  created_by      uuid REFERENCES core.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code_hmac),
  CHECK (can_upload OR can_view)
);

-- Code/QR holders. Not platform users: scoped to one event, named by
-- themselves, and only as good as the credential they came in with.
CREATE TABLE events.guests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  access_code_id uuid NOT NULL REFERENCES events.access_codes(id) ON DELETE CASCADE,
  via            text NOT NULL CHECK (via IN ('code', 'qr')),
  display_name   text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 60),
  token_hash     bytea NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz
);

CREATE TABLE events.uploads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  uploader_user_id  uuid REFERENCES core.users(id) ON DELETE SET NULL,
  uploader_guest_id uuid REFERENCES events.guests(id) ON DELETE SET NULL,
  uploader_name     text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('photo', 'video')),
  content_type      text NOT NULL,
  filename          text NOT NULL DEFAULT '',
  size_bytes        bigint NOT NULL CHECK (size_bytes > 0),
  original_key      text NOT NULL UNIQUE,
  -- Downscaled copy made on the phone; re-encoding drops location metadata.
  -- Galleries show this; originals are for owners and downloads.
  preview_key       text,
  -- Frame/filter/sticker manifest; the original is never altered.
  overlay           jsonb,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  hidden            boolean NOT NULL DEFAULT false,
  featured          boolean NOT NULL DEFAULT false,
  caption           text NOT NULL DEFAULT '' CHECK (length(caption) <= 500),
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  CHECK (uploader_user_id IS NULL OR uploader_guest_id IS NULL)
);
CREATE INDEX uploads_event_idx ON events.uploads (event_id, created_at DESC);

-- Group chat on an event, for known people (members) only.
CREATE TABLE events.messages (
  id         bigserial PRIMARY KEY,
  event_id   uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX messages_event_idx ON events.messages (event_id, id);

-- ── Request context ─────────────────────────────────────────────────────────

CREATE FUNCTION events.ctx_user() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION events.ctx_admin() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.is_admin', true), '') = 'true' $$;
CREATE FUNCTION events.ctx_guest() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.guest_id', true), '')::uuid $$;
CREATE FUNCTION events.ctx_event() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.event_id', true), '')::uuid $$;
CREATE FUNCTION events.ctx_can_upload() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT events.ctx_guest() IS NOT NULL AND coalesce(current_setting('app.can_upload', true), '') = 'true' $$;
CREATE FUNCTION events.ctx_can_view() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT events.ctx_guest() IS NOT NULL AND coalesce(current_setting('app.can_view', true), '') = 'true' $$;

-- Membership checks run as the table owner (SECURITY DEFINER) so policies on
-- members can consult members without recursing into their own RLS.
CREATE FUNCTION events.member_role(ev uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT role FROM events.members WHERE event_id = ev AND user_id = events.ctx_user() $$;

CREATE FUNCTION events.can_manage(ev uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT events.ctx_admin() OR coalesce(events.member_role(ev) IN ('owner', 'curator'), false) $$;

-- Owners (and the platform admin) manage people and access codes; curators
-- manage content.
CREATE FUNCTION events.can_own(ev uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT events.ctx_admin() OR coalesce(events.member_role(ev) = 'owner', false) $$;

CREATE FUNCTION events.is_member(ev uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT events.ctx_admin() OR events.member_role(ev) IS NOT NULL $$;

-- May the current requester see this event's album (published content)?
CREATE FUNCTION events.can_view_album(ev uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS $$
  SELECT events.is_member(ev)
      OR (events.ctx_event() = ev AND events.ctx_can_view())
      OR EXISTS (
           SELECT 1 FROM events.events e
            WHERE e.id = ev AND e.status = 'published'
              AND (e.audience = 'public'
                   OR (e.audience = 'family' AND EXISTS (
                         SELECT 1 FROM core.family_members f WHERE f.user_id = events.ctx_user()))))
$$;

CREATE FUNCTION events.can_create_events() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = core, pg_temp AS
  $$ SELECT EXISTS (SELECT 1 FROM core.users u
                     WHERE u.id = events.ctx_user() AND u.is_active AND u.platform_role IN ('admin', 'creator')) $$;

CREATE FUNCTION events.created_event(ev uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT EXISTS (SELECT 1 FROM events.events WHERE id = ev AND created_by = events.ctx_user()) $$;

-- ── Resolver side: code/QR → event, and guest sessions ──────────────────────
-- Anonymous requests can't read access_codes or guests. These functions are
-- the only way in, and they return just what the caller needs.

CREATE FUNCTION events.resolve_code(ev_slug text, hmac bytea)
  RETURNS TABLE (access_code_id uuid, event_id uuid, can_upload boolean, can_view boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS $$
  SELECT c.id, c.event_id, c.can_upload, c.can_view
    FROM events.access_codes c JOIN events.events e ON e.id = c.event_id
   WHERE e.slug = ev_slug AND c.code_hmac = hmac AND c.code_revoked_at IS NULL
$$;

CREATE FUNCTION events.resolve_qr(hash bytea)
  RETURNS TABLE (access_code_id uuid, event_id uuid, slug text, can_upload boolean, can_view boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS $$
  SELECT c.id, c.event_id, e.slug, c.can_upload, c.can_view
    FROM events.access_codes c JOIN events.events e ON e.id = c.event_id
   WHERE c.qr_hash = hash AND c.qr_revoked_at IS NULL
$$;

CREATE FUNCTION events.create_guest(code uuid, via_ text, name text, token bytea) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = events, pg_temp AS $$
DECLARE g uuid;
BEGIN
  INSERT INTO events.guests (event_id, access_code_id, via, display_name, token_hash)
  SELECT c.event_id, c.id, via_, trim(name), token
    FROM events.access_codes c
   WHERE c.id = code
     AND ((via_ = 'code' AND c.code_revoked_at IS NULL) OR (via_ = 'qr' AND c.qr_revoked_at IS NULL))
  RETURNING id INTO g;
  RETURN g;
END $$;

-- A guest session is live while the guest isn't revoked and the credential
-- they came in with still works. Scope comes from the code at request time,
-- so changing what a code allows applies to everyone already holding it.
CREATE FUNCTION events.resolve_guest(token bytea, ev uuid)
  RETURNS TABLE (guest_id uuid, display_name text, can_upload boolean, can_view boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = events, pg_temp AS $$
BEGIN
  RETURN QUERY
  UPDATE events.guests g SET last_seen_at = now()
    FROM events.access_codes c
   WHERE g.token_hash = token AND g.event_id = ev AND g.revoked_at IS NULL
     AND c.id = g.access_code_id
     AND ((g.via = 'code' AND c.code_revoked_at IS NULL) OR (g.via = 'qr' AND c.qr_revoked_at IS NULL))
  RETURNING g.id, g.display_name, c.can_upload, c.can_view;
END $$;

-- Read-only facts a public page needs before anyone has a session.
CREATE FUNCTION events.public_event(ev_slug text)
  RETURNS TABLE (id uuid, slug text, title text, starts_on date, location text, status text, audience text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT id, slug, title, starts_on, location, status, audience FROM events.events WHERE slug = ev_slug $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA events FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA events TO i2w2i_app;

-- ── Policies ────────────────────────────────────────────────────────────────

ALTER TABLE events.events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events.members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE events.access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE events.guests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events.uploads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE events.messages     ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_read ON events.events FOR SELECT
  USING (events.is_member(id) OR created_by = events.ctx_user() OR events.ctx_event() = id OR events.can_view_album(id));
CREATE POLICY events_create ON events.events FOR INSERT
  WITH CHECK (events.can_create_events() AND created_by = events.ctx_user());
CREATE POLICY events_edit ON events.events FOR UPDATE
  USING (events.can_manage(id)) WITH CHECK (events.can_manage(id));
CREATE POLICY events_delete ON events.events FOR DELETE
  USING (events.can_own(id));

CREATE POLICY members_read ON events.members FOR SELECT
  USING (events.is_member(event_id));
CREATE POLICY members_add ON events.members FOR INSERT
  WITH CHECK (events.can_own(event_id)
              -- the creator adding themselves as first owner
              OR (events.created_event(event_id) AND user_id = events.ctx_user() AND role = 'owner'));
CREATE POLICY members_edit ON events.members FOR UPDATE
  USING (events.can_own(event_id)) WITH CHECK (events.can_own(event_id));
CREATE POLICY members_remove ON events.members FOR DELETE
  USING (events.can_own(event_id));

CREATE POLICY codes_manage ON events.access_codes FOR ALL
  USING (events.can_own(event_id)) WITH CHECK (events.can_own(event_id));

CREATE POLICY guests_read ON events.guests FOR SELECT
  USING (events.can_manage(event_id) OR id = events.ctx_guest());
CREATE POLICY guests_revoke ON events.guests FOR UPDATE
  USING (events.can_manage(event_id)) WITH CHECK (events.can_manage(event_id));
-- No INSERT policy: guests are created only through events.create_guest().

CREATE POLICY uploads_read ON events.uploads FOR SELECT USING (
     events.can_manage(event_id)
  OR (events.ctx_user() IS NOT NULL AND uploader_user_id = events.ctx_user())
  OR (events.ctx_guest() IS NOT NULL AND uploader_guest_id = events.ctx_guest())
  OR (status = 'ready' AND NOT hidden AND events.can_view_album(event_id))
);
CREATE POLICY uploads_add ON events.uploads FOR INSERT WITH CHECK (
     (events.ctx_user() IS NOT NULL AND uploader_user_id = events.ctx_user()
      AND uploader_guest_id IS NULL AND events.is_member(event_id))
  OR (events.ctx_guest() IS NOT NULL AND uploader_guest_id = events.ctx_guest()
      AND uploader_user_id IS NULL AND event_id = events.ctx_event() AND events.ctx_can_upload())
);
-- Uploaders finish their own pending uploads; managers moderate everything.
CREATE POLICY uploads_edit ON events.uploads FOR UPDATE USING (
     events.can_manage(event_id)
  OR (status = 'pending' AND events.ctx_user() IS NOT NULL AND uploader_user_id = events.ctx_user())
  OR (status = 'pending' AND events.ctx_guest() IS NOT NULL AND uploader_guest_id = events.ctx_guest())
) WITH CHECK (
     events.can_manage(event_id)
  OR (NOT hidden AND NOT featured AND events.ctx_user() IS NOT NULL AND uploader_user_id = events.ctx_user()
      AND events.is_member(event_id))
  OR (NOT hidden AND NOT featured AND events.ctx_guest() IS NOT NULL AND uploader_guest_id = events.ctx_guest()
      AND event_id = events.ctx_event())
);
CREATE POLICY uploads_delete ON events.uploads FOR DELETE USING (events.can_manage(event_id));

CREATE POLICY messages_read ON events.messages FOR SELECT USING (events.is_member(event_id));
CREATE POLICY messages_add ON events.messages FOR INSERT WITH CHECK (
  user_id = events.ctx_user() AND events.is_member(event_id)
  AND EXISTS (SELECT 1 FROM events.events e WHERE e.id = event_id AND e.chat_enabled)
);
CREATE POLICY messages_edit ON events.messages FOR UPDATE
  USING (user_id = events.ctx_user() OR events.can_manage(event_id))
  WITH CHECK (user_id = events.ctx_user() OR events.can_manage(event_id));

-- Guests are never inserted directly; deleting history is for owners via the
-- event cascade, not row by row.
REVOKE INSERT, DELETE ON events.guests FROM i2w2i_app;
REVOKE DELETE ON events.messages FROM i2w2i_app;
