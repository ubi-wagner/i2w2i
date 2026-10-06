-- Roleplay scenes.
--
-- A roleplay is asked for on its own (a nudge), and it skips the
-- inspection, scoring and rewards: the lead ends it straight into
-- aftercare, where each of you says what you loved and didn't. The server
-- enforces that, so it needs to know which scenes are roleplays: this flag
-- is set when one is asked for and never changes. Only the kind: which
-- roleplay it is, and everything in it, stays encrypted in plan_enc.
-- Scenes from before this keep the inspection.

ALTER TABLE som.scenes ADD COLUMN roleplay boolean NOT NULL DEFAULT false;
