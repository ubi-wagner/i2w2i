-- How an event's pages look (album, join page, printed cards) and what the
-- hosts write on them: invitation wording, directions, schedule, notes
-- (shape and limits in lib/events/page.ts), and a note above gift links.
ALTER TABLE events.events
  ADD COLUMN theme text NOT NULL DEFAULT 'classic' CHECK (theme IN ('classic', 'woodland', 'garden')),
  ADD COLUMN gift_note text NOT NULL DEFAULT '' CHECK (length(gift_note) <= 500),
  ADD COLUMN page jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(page) = 'object' AND length(page::text) <= 32000);

-- The join page needs the look and the invitation wording before anyone has
-- joined. Only those lines: the address, schedule and notes stay behind RLS.
DROP FUNCTION events.public_event(text);
CREATE FUNCTION events.public_event(ev_slug text)
  RETURNS TABLE (id uuid, slug text, title text, starts_on date, location text, status text, audience text,
                 theme text, page_public jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = events, pg_temp AS
  $$ SELECT id, slug, title, starts_on, location, status, audience, theme,
            jsonb_strip_nulls(jsonb_build_object('kicker', page->'kicker', 'inviteLine', page->'inviteLine',
                                                 'timeLine', page->'timeLine', 'footerLine', page->'footerLine'))
       FROM events.events WHERE slug = ev_slug $$;
REVOKE ALL ON FUNCTION events.public_event(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION events.public_event(text) TO i2w2i_app;
