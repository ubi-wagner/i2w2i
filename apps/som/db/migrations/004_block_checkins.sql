-- Check-ins at the end of each block of a scene's day.
--
-- A scene's day is made of two-hour blocks (lib/blocks.ts), and the follow
-- checks in at the end of each one. checkin_at holds those times as minutes
-- from the start, checkin_base when the day started (moved on by time spent
-- paused), and checkin_blocks whether they're on. Every-so-many-minutes
-- (checkin_minutes) wins when it's set; with neither there are no
-- check-ins. Only times: what's in the blocks stays encrypted.

ALTER TABLE som.scenes
  ADD COLUMN checkin_at     integer[] NOT NULL DEFAULT '{}' CHECK (cardinality(checkin_at) <= 12),
  ADD COLUMN checkin_base   timestamptz,
  ADD COLUMN checkin_blocks boolean NOT NULL DEFAULT false;
