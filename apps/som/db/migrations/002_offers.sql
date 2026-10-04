-- Offers, demands and praise.
--
-- The lead offers a window of their time (a day, from, until); the follow
-- accepts, or asks for a change by schedule (another window) or capacity
-- (how much they can take on), with a note. Once agreed the lead builds the
-- scene to fit and sends it, and the follow starts it in the window. The
-- window is the server's to know (reminders, no double booking); the
-- follow's capacity and note, like everything in the scene, are encrypted.
--
--   offered   lead → follow: "a scene from starts_at until ends_at"
--   accepted  agreed; the lead builds it
--   ready     sent: the tasks exist, waiting for the follow to start

ALTER TABLE som.scenes DROP CONSTRAINT scenes_status_check;
ALTER TABLE som.scenes ADD CONSTRAINT scenes_status_check
  CHECK (status IN ('draft', 'offered', 'accepted', 'proposed', 'ready', 'active', 'inspection', 'aftercare', 'closed'));

ALTER TABLE som.scenes
  ADD COLUMN starts_at      timestamptz,
  ADD COLUMN ends_at        timestamptz,
  -- { by, startsAt, endsAt }: the window the follow asked for instead.
  ADD COLUMN change_request jsonb,
  -- The follow's answer, encrypted: { capacity, note }.
  ADD COLUMN reply_enc      text,
  ADD CONSTRAINT scenes_window_check CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (ends_at > starts_at AND ends_at <= starts_at + interval '48 hours'));

CREATE INDEX ON som.scenes (pod_id, starts_at) WHERE starts_at IS NOT NULL;

-- Praise from the lead, said on its own or with an approval.
ALTER TABLE som.entries DROP CONSTRAINT entries_kind_check;
ALTER TABLE som.entries ADD CONSTRAINT entries_kind_check
  CHECK (kind IN ('comment', 'writing', 'checkin', 'scores', 'outcomes', 'aftercare', 'reflection', 'praise'));

-- A reminder when a sent scene's window opens.
ALTER TABLE som.timers DROP CONSTRAINT timers_kind_check;
ALTER TABLE som.timers ADD CONSTRAINT timers_kind_check
  CHECK (kind IN ('checkin_due', 'checkin_overdue', 'task_due', 'arrival_soon', 'arrival', 'scene_start'));
