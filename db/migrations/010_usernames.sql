-- Sign in with a username: nothing is ever emailed, so nobody needs to give
-- an email address. Email becomes optional. Existing accounts get a username
-- made from their email (eric@… → eric) and can still sign in with either.

-- A free username based on `base`: lower case letters, digits, . _ and -,
-- starting with a letter or digit, with a number added if it's taken.
CREATE FUNCTION core.free_username(base text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  b text := left(regexp_replace(regexp_replace(lower(coalesce(base, '')), '[^a-z0-9._-]+', '', 'g'), '^[._-]+', ''), 28);
  candidate text;
  n int := 1;
BEGIN
  IF length(b) < 2 THEN b := 'user'; END IF;
  candidate := b;
  WHILE EXISTS (SELECT 1 FROM core.users WHERE username = candidate) LOOP
    n := n + 1;
    candidate := b || n;
  END LOOP;
  RETURN candidate;
END $$;

ALTER TABLE core.users ADD COLUMN username citext;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, email, display_name FROM core.users ORDER BY created_at, id LOOP
    UPDATE core.users SET username = core.free_username(coalesce(split_part(r.email::text, '@', 1), r.display_name))
     WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE core.users
  ALTER COLUMN username SET NOT NULL,
  ADD CONSTRAINT users_username_key UNIQUE (username),
  -- Stored lower case (the citext column also compares case-insensitively).
  ADD CONSTRAINT users_username_format CHECK (username::text ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  ALTER COLUMN email DROP NOT NULL;

-- Anything that still creates an account without a username (the bootstrap
-- script, tests) gets one from the email or the name.
CREATE FUNCTION core.users_default_username() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.username IS NULL THEN
    NEW.username := core.free_username(coalesce(split_part(NEW.email::text, '@', 1), NEW.display_name));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER users_default_username BEFORE INSERT ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.users_default_username();
