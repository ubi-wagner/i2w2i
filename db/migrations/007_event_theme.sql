-- How an event's pages look (album, join page, printed cards), and a note
-- from the hosts above their gift links.
ALTER TABLE events.events
  ADD COLUMN theme text NOT NULL DEFAULT 'classic' CHECK (theme IN ('classic', 'woodland', 'garden')),
  ADD COLUMN gift_note text NOT NULL DEFAULT '' CHECK (length(gift_note) <= 500);

-- The join page needs the theme before anyone has joined. Nothing private.
DROP FUNCTION events.public_event(text);
CREATE FUNCTION events.public_event(ev_slug text)
  RETURNS TABLE (id uuid, slug text, title text, starts_on date, location text, status text, audience text, theme text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT id, slug, title, starts_on, location, status, audience, theme FROM events.events WHERE slug = ev_slug $$;
REVOKE ALL ON FUNCTION events.public_event(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION events.public_event(text) TO i2w2i_app;
