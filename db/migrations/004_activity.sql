-- 004_activity: passwords for every account, and a record of who did what
-- from which device.

-- Every account may now set a password (email links remain for invites and
-- recovery). 001 is live, so this is a new migration rather than an edit.
ALTER TABLE core.users DROP CONSTRAINT members_have_no_password;

-- Account actions (sign-ins, admin changes) carry request details too.
ALTER TABLE core.audit_log
  ADD COLUMN ip         text,
  ADD COLUMN user_agent text,
  ADD COLUMN device_id  text,
  ADD COLUMN request    jsonb;
CREATE INDEX audit_log_device_idx ON core.audit_log (device_id) WHERE device_id IS NOT NULL;

-- Everything that happens on an event, by accounts and guests alike, with
-- the device and network it came from. Append-only; owners and curators of
-- the event (and the platform admin) can read it, nobody can change it.
CREATE TABLE events.activity (
  id         bigserial PRIMARY KEY,
  event_id   uuid REFERENCES events.events(id) ON DELETE CASCADE,
  action     text NOT NULL,
  user_id    uuid REFERENCES core.users(id) ON DELETE SET NULL,
  guest_id   uuid REFERENCES events.guests(id) ON DELETE SET NULL,
  -- No foreign key: the record outlives a deleted upload.
  upload_id  uuid,
  -- Name as given at the time (guests can only be identified this way).
  actor_name text,
  device_id  text,
  ip         text,
  user_agent text,
  -- What the browser reported: screen, timezone, platform, model, ...
  client     jsonb,
  -- What the request carried: forwarded-for chain, language, client hints, ...
  request    jsonb,
  -- Action specifics: file metadata, camera EXIF, the code that was tried, ...
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_event_idx  ON events.activity (event_id, id DESC);
CREATE INDEX activity_device_idx ON events.activity (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX activity_upload_idx ON events.activity (upload_id) WHERE upload_id IS NOT NULL;

ALTER TABLE events.activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_read ON events.activity FOR SELECT USING (events.can_manage(event_id));
REVOKE INSERT, UPDATE, DELETE ON events.activity FROM i2w2i_app;

-- The only way in, so anonymous requests (a wrong code, a QR scan) can be
-- recorded without being able to read or alter anything. Oversized values
-- are trimmed rather than rejected: losing a log line is worse.
CREATE FUNCTION events.log_activity(p jsonb) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = events, pg_temp AS $$
  INSERT INTO events.activity (event_id, action, user_id, guest_id, upload_id, actor_name,
                               device_id, ip, user_agent, client, request, detail)
  VALUES (nullif(p->>'event_id', '')::uuid,
          left(p->>'action', 60),
          nullif(p->>'user_id', '')::uuid,
          nullif(p->>'guest_id', '')::uuid,
          nullif(p->>'upload_id', '')::uuid,
          left(p->>'actor_name', 120),
          left(p->>'device_id', 80),
          left(p->>'ip', 100),
          left(p->>'user_agent', 1000),
          CASE WHEN length(coalesce(p->>'client', '')) <= 8000 THEN p->'client' END,
          CASE WHEN length(coalesce(p->>'request', '')) <= 8000 THEN p->'request' END,
          CASE WHEN length(coalesce(p->>'detail', '')) <= 16000 THEN coalesce(p->'detail', '{}'::jsonb) ELSE '{}'::jsonb END)
$$;
REVOKE ALL ON FUNCTION events.log_activity(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION events.log_activity(jsonb) TO i2w2i_app;
