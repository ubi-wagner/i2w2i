-- 011_event_albums: named albums inside an event ("Getting ready",
-- "Ceremony", "Reception"). Every approved photo stays in the event's main
-- grid; hosts and helpers (can_manage) also post photos into albums and
-- publish each album when it's ready. Published albums are listed on the
-- event's page ("View albums"), each with its own page.
--
-- An album only ever points at uploads: what a visitor sees through one is
-- still decided by the uploads policy (approved, not hidden, can_view_album),
-- so a photo waiting for review or hidden never shows in an album either.

CREATE TABLE events.albums (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  slug            text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 60),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  description     text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  cover_upload_id uuid,
  sort_order      int NOT NULL DEFAULT 0,
  -- Null while it's being put together: only hosts and helpers see it.
  published_at    timestamptz,
  created_by      uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug),
  UNIQUE (id, event_id)
);

-- Lets albums and their items point at uploads of the same event only.
ALTER TABLE events.uploads ADD CONSTRAINT uploads_id_event_key UNIQUE (id, event_id);
ALTER TABLE events.albums ADD CONSTRAINT albums_cover_fkey
  FOREIGN KEY (cover_upload_id, event_id) REFERENCES events.uploads(id, event_id) ON DELETE SET NULL (cover_upload_id);

CREATE TABLE events.album_items (
  album_id  uuid NOT NULL,
  upload_id uuid NOT NULL,
  event_id  uuid NOT NULL,
  added_by  uuid REFERENCES core.users(id) ON DELETE SET NULL,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, upload_id),
  FOREIGN KEY (album_id, event_id) REFERENCES events.albums(id, event_id) ON DELETE CASCADE,
  FOREIGN KEY (upload_id, event_id) REFERENCES events.uploads(id, event_id) ON DELETE CASCADE
);
CREATE INDEX album_items_upload_idx ON events.album_items (upload_id);
CREATE INDEX albums_event_idx ON events.albums (event_id, sort_order);

ALTER TABLE events.albums      ENABLE ROW LEVEL SECURITY;
ALTER TABLE events.album_items ENABLE ROW LEVEL SECURITY;

-- Hosts and helpers see every album; everyone who can see the event's
-- photos sees its published ones.
CREATE POLICY albums_read ON events.albums FOR SELECT
  USING (events.can_manage(event_id) OR (published_at IS NOT NULL AND events.can_view_album(event_id)));
CREATE POLICY albums_add ON events.albums FOR INSERT WITH CHECK (events.can_manage(event_id));
CREATE POLICY albums_edit ON events.albums FOR UPDATE
  USING (events.can_manage(event_id)) WITH CHECK (events.can_manage(event_id));
CREATE POLICY albums_remove ON events.albums FOR DELETE USING (events.can_manage(event_id));

CREATE POLICY album_items_read ON events.album_items FOR SELECT
  USING (events.can_manage(event_id)
         OR (events.can_view_album(event_id)
             AND EXISTS (SELECT 1 FROM events.albums a WHERE a.id = album_id AND a.published_at IS NOT NULL)));
CREATE POLICY album_items_add ON events.album_items FOR INSERT WITH CHECK (events.can_manage(event_id));
CREATE POLICY album_items_remove ON events.album_items FOR DELETE USING (events.can_manage(event_id));
