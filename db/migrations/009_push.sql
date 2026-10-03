-- 009_push: notifications to people's phones (the installed web app).

-- Platform settings the server creates for itself, e.g. its web-push keys.
CREATE TABLE core.settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per phone or browser that said yes to notifications.
CREATE TABLE core.push_subscriptions (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE CHECK (length(endpoint) <= 1000),
  p256dh       text NOT NULL CHECK (length(p256dh) <= 200),
  auth         text NOT NULL CHECK (length(auth) <= 100),
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON core.push_subscriptions (user_id);

-- Who reviews an event's uploads (hosts and helpers) and how many are waiting.
-- For the server's notifier, which has no signed-in person behind it; it
-- returns names and counts, never uploads.
CREATE FUNCTION events.review_summary(ev uuid)
  RETURNS TABLE (title text, pending int, reviewers uuid[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS $$
  SELECT e.title,
         (SELECT count(*)::int FROM events.uploads u
           WHERE u.event_id = e.id AND u.status = 'ready' AND u.approved_at IS NULL AND NOT u.hidden),
         ARRAY(SELECT m.user_id FROM events.members m WHERE m.event_id = e.id AND m.role IN ('owner', 'curator'))
    FROM events.events e WHERE e.id = ev
$$;
REVOKE ALL ON FUNCTION events.review_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION events.review_summary(uuid) TO i2w2i_app;
