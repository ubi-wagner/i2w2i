-- 012_album_audience: every album is its own page, private or public.
--   private: whoever can see the event's photos (as in 011);
--   public:  anyone with the album's link, signed in or not, even while the
--            event itself is private.
-- A public album opens only itself: its approved, unhidden photos. Nothing
-- else of the event (the other photos, the address, the chat, comments).

ALTER TABLE events.albums
  ADD COLUMN audience text NOT NULL DEFAULT 'private' CHECK (audience IN ('private', 'public'));

-- In at least one published public album. Definer, so the uploads policy
-- below can ask without the caller's own view of albums getting in the way.
CREATE FUNCTION events.in_public_album(upload uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM events.album_items i JOIN events.albums a ON a.id = i.album_id
     WHERE i.upload_id = upload AND a.published_at IS NOT NULL AND a.audience = 'public')
$$;
REVOKE ALL ON FUNCTION events.in_public_album(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION events.in_public_album(uuid) TO i2w2i_app;

DROP POLICY albums_read ON events.albums;
CREATE POLICY albums_read ON events.albums FOR SELECT
  USING (events.can_manage(event_id)
         OR (published_at IS NOT NULL AND (audience = 'public' OR events.can_view_album(event_id))));

DROP POLICY album_items_read ON events.album_items;
CREATE POLICY album_items_read ON events.album_items FOR SELECT
  USING (events.can_manage(event_id)
         OR EXISTS (SELECT 1 FROM events.albums a
                     WHERE a.id = album_id AND a.published_at IS NOT NULL
                       AND (a.audience = 'public' OR events.can_view_album(album_items.event_id))));

-- As in 008, plus: an approved, unhidden photo in a published public album.
DROP POLICY uploads_read ON events.uploads;
CREATE POLICY uploads_read ON events.uploads FOR SELECT USING (
     events.can_manage(event_id)
  OR (events.ctx_user() IS NOT NULL AND uploader_user_id = events.ctx_user())
  OR (events.ctx_guest() IS NOT NULL AND uploader_guest_id = events.ctx_guest())
  OR (status = 'ready' AND NOT hidden AND approved_at IS NOT NULL
      AND (events.can_view_album(event_id) OR events.in_public_album(id)))
);
