-- Offers, demands and praise.
--
-- The lead can offer a scene for a day and a length; the follow accepts or
-- asks for a change (another time or length, with a note); once agreed the
-- lead builds it and sends it, and the follow starts it. When and how long
-- are the server's to know (for the start reminder); what's in the scene
-- stays encrypted, and so does the note with a change request.
--
--   offered   lead → follow: "a scene at starts_at, for hours"
--   accepted  agreed; the lead builds it
--   ready     sent: the tasks exist, waiting for the follow to start

ALTER TABLE som.scenes DROP CONSTRAINT scenes_status_check;
ALTER TABLE som.scenes ADD CONSTRAINT scenes_status_check
  CHECK (status IN ('draft', 'offered', 'accepted', 'proposed', 'ready', 'active', 'inspection', 'aftercare', 'closed'));

ALTER TABLE som.scenes
  ADD COLUMN starts_at      timestamptz,
  ADD COLUMN hours          integer CHECK (hours BETWEEN 1 AND 48),
  -- { by, startsAt, hours, noteEnc } from the follow; noteEnc is ciphertext.
  ADD COLUMN change_request jsonb;

-- Praise from the lead, said on its own or with an approval.
ALTER TABLE som.entries DROP CONSTRAINT entries_kind_check;
ALTER TABLE som.entries ADD CONSTRAINT entries_kind_check
  CHECK (kind IN ('comment', 'writing', 'checkin', 'scores', 'outcomes', 'aftercare', 'reflection', 'praise'));

-- A reminder when a sent scene is due to start.
ALTER TABLE som.timers DROP CONSTRAINT timers_kind_check;
ALTER TABLE som.timers ADD CONSTRAINT timers_kind_check
  CHECK (kind IN ('checkin_due', 'checkin_overdue', 'task_due', 'arrival_soon', 'arrival', 'scene_start'));
