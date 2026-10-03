-- 005_album_features: resumable uploads, photo comments, gift links, frames.

-- ── Resumable uploads ───────────────────────────────────────────────────────
-- Large files go up as an S3 multipart upload so an interrupted transfer
-- resumes from the parts already stored instead of starting over.
ALTER TABLE events.uploads ADD COLUMN multipart_id text;

-- ── Comments on photos and videos ───────────────────────────────────────────
CREATE TABLE events.comments (
  id          bigserial PRIMARY KEY,
  event_id    uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  upload_id   uuid NOT NULL REFERENCES events.uploads(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES core.users(id) ON DELETE SET NULL,
  guest_id    uuid REFERENCES events.guests(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body        text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (user_id IS NULL OR guest_id IS NULL)
);
CREATE INDEX comments_upload_idx ON events.comments (upload_id, id);

ALTER TABLE events.comments ENABLE ROW LEVEL SECURITY;
-- Anyone who can see the album can read and write comments; the upload must
-- be one they can see (the uploads policy applies inside the EXISTS).
CREATE POLICY comments_read ON events.comments FOR SELECT
  USING (events.can_manage(event_id)
         OR (deleted_at IS NULL AND events.can_view_album(event_id))
         -- Authors always see their own (needed to remove them).
         OR (events.ctx_user() IS NOT NULL AND user_id = events.ctx_user())
         OR (events.ctx_guest() IS NOT NULL AND guest_id = events.ctx_guest()));
CREATE POLICY comments_add ON events.comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM events.uploads u WHERE u.id = upload_id AND u.event_id = comments.event_id)
  AND events.can_view_album(event_id)
  AND (
       (user_id = events.ctx_user() AND guest_id IS NULL)
    OR (guest_id = events.ctx_guest() AND user_id IS NULL AND event_id = events.ctx_event())
  )
);
-- Authors remove their own; managers remove anyone's. Removal is a soft delete.
CREATE POLICY comments_edit ON events.comments FOR UPDATE
  USING (events.can_manage(event_id)
         OR (events.ctx_user() IS NOT NULL AND user_id = events.ctx_user())
         OR (events.ctx_guest() IS NOT NULL AND guest_id = events.ctx_guest()))
  WITH CHECK (events.can_manage(event_id)
         OR (events.ctx_user() IS NOT NULL AND user_id = events.ctx_user())
         OR (events.ctx_guest() IS NOT NULL AND guest_id = events.ctx_guest()));
REVOKE DELETE ON events.comments FROM i2w2i_app;

-- ── Gift, Venmo and registry links shown on the album ───────────────────────
CREATE TABLE events.links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('venmo', 'paypal', 'cashapp', 'zelle', 'registry', 'link')),
  label      text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  url        text NOT NULL CHECK (url ~ '^https://' AND length(url) <= 500),
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE events.links ENABLE ROW LEVEL SECURITY;
-- Visible to whoever can see the event itself (the events policy applies).
CREATE POLICY links_read ON events.links FOR SELECT
  USING (EXISTS (SELECT 1 FROM events.events e WHERE e.id = event_id));
CREATE POLICY links_manage_add ON events.links FOR INSERT WITH CHECK (events.can_own(event_id));
CREATE POLICY links_manage_edit ON events.links FOR UPDATE USING (events.can_own(event_id)) WITH CHECK (events.can_own(event_id));
CREATE POLICY links_manage_remove ON events.links FOR DELETE USING (events.can_own(event_id));

-- ── Frames and filters ──────────────────────────────────────────────────────
-- An uploader may decorate their own photo or video (frame/filter/caption
-- manifest, plus a re-rendered preview for photos) for a day after
-- uploading, unless a manager has hidden it. The original is never touched. Done through a function so
-- the general uploads policy stays strict (uploaders can't edit finished rows).
CREATE FUNCTION events.set_overlay(upload uuid, manifest jsonb, cap text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = events, pg_temp AS $$
DECLARE n int;
BEGIN
  IF manifest IS NOT NULL AND length(manifest::text) > 8000 THEN RETURN false; END IF;
  UPDATE events.uploads u
     SET overlay = manifest, caption = left(coalesce(cap, ''), 500)
   WHERE u.id = upload
     AND NOT u.hidden
     AND u.created_at > now() - interval '1 day'
     AND ((events.ctx_user() IS NOT NULL AND u.uploader_user_id = events.ctx_user())
          OR (events.ctx_guest() IS NOT NULL AND u.uploader_guest_id = events.ctx_guest() AND u.event_id = events.ctx_event()));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;
REVOKE ALL ON FUNCTION events.set_overlay(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION events.set_overlay(uuid, jsonb, text) TO i2w2i_app;
