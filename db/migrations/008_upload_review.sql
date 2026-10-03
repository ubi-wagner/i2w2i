-- 008_upload_review: nothing anyone uploads is shown to anyone else until a
-- host (owner or helper) has looked at it and approved it. Uploaders always
-- see their own; hosts see everything. Hosts' own uploads need no review.
--
-- An approval is for the exact bytes the host saw, so:
--   * a host can only approve once every upload link handed out for it has
--     expired (writable_until), so the picture can't be swapped afterwards;
--   * anything the uploader changes later (frame, caption, the gallery copy)
--     withdraws the approval until a host looks again.
ALTER TABLE events.uploads
  ADD COLUMN approved_at    timestamptz,
  ADD COLUMN approved_by    uuid REFERENCES core.users(id) ON DELETE SET NULL,
  -- Latest expiry of any presigned PUT for this upload's objects.
  ADD COLUMN writable_until timestamptz;

-- Everything already in albums was visible before reviews existed.
UPDATE events.uploads SET approved_at = coalesce(completed_at, created_at) WHERE status = 'ready';

CREATE INDEX uploads_review_idx ON events.uploads (event_id) WHERE approved_at IS NULL AND status = 'ready';

CREATE FUNCTION events.uploads_review() RETURNS trigger
  LANGUAGE plpgsql SET search_path = events, pg_temp AS $$
DECLARE host boolean := events.can_manage(NEW.event_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.approved_at := CASE WHEN host THEN now() END;
    NEW.approved_by := CASE WHEN host THEN events.ctx_user() END;
    RETURN NEW;
  END IF;
  IF (NEW.approved_at, NEW.approved_by) IS DISTINCT FROM (OLD.approved_at, OLD.approved_by) THEN
    IF NOT host THEN
      RAISE EXCEPTION 'only hosts approve uploads' USING ERRCODE = '42501';
    END IF;
    IF NEW.approved_at IS NOT NULL AND NEW.writable_until > now() THEN
      RAISE EXCEPTION 'upload can still be changed by its uploader' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NOT host AND (NEW.overlay, NEW.caption, NEW.preview_key, NEW.writable_until)
                  IS DISTINCT FROM (OLD.overlay, OLD.caption, OLD.preview_key, OLD.writable_until) THEN
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER uploads_review BEFORE INSERT OR UPDATE ON events.uploads
  FOR EACH ROW EXECUTE FUNCTION events.uploads_review();

-- Others see only approved uploads.
DROP POLICY uploads_read ON events.uploads;
CREATE POLICY uploads_read ON events.uploads FOR SELECT USING (
     events.can_manage(event_id)
  OR (events.ctx_user() IS NOT NULL AND uploader_user_id = events.ctx_user())
  OR (events.ctx_guest() IS NOT NULL AND uploader_guest_id = events.ctx_guest())
  OR (status = 'ready' AND NOT hidden AND approved_at IS NOT NULL AND events.can_view_album(event_id))
);

-- Decorating hands the uploader a new upload link for the gallery copy, which
-- is rewritten in place. So uploaders may decorate only until a host approves
-- (hosts' own uploads excepted), and each decoration keeps the item
-- unapprovable until that link expires. 11 minutes = UPLOAD_URL_TTL in
-- lib/storage.ts plus margin.
CREATE OR REPLACE FUNCTION events.set_overlay(upload uuid, manifest jsonb, cap text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = events, pg_temp AS $$
DECLARE n int;
BEGIN
  IF manifest IS NOT NULL AND length(manifest::text) > 8000 THEN RETURN false; END IF;
  UPDATE events.uploads u
     SET overlay = manifest, caption = left(coalesce(cap, ''), 500),
         writable_until = CASE WHEN u.kind = 'photo' THEN now() + interval '11 minutes' ELSE u.writable_until END
   WHERE u.id = upload
     AND NOT u.hidden
     AND u.created_at > now() - interval '1 day'
     AND (u.approved_at IS NULL OR events.can_manage(u.event_id))
     AND ((events.ctx_user() IS NOT NULL AND u.uploader_user_id = events.ctx_user())
          OR (events.ctx_guest() IS NOT NULL AND u.uploader_guest_id = events.ctx_guest() AND u.event_id = events.ctx_event()));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

-- Comments on a photo are readable only by people who can see the photo.
DROP POLICY comments_read ON events.comments;
CREATE POLICY comments_read ON events.comments FOR SELECT
  USING (events.can_manage(event_id)
         OR (deleted_at IS NULL AND events.can_view_album(event_id)
             AND EXISTS (SELECT 1 FROM events.uploads u WHERE u.id = upload_id))
         -- Authors always see their own (needed to remove them).
         OR (events.ctx_user() IS NOT NULL AND user_id = events.ctx_user())
         OR (events.ctx_guest() IS NOT NULL AND guest_id = events.ctx_guest()));
