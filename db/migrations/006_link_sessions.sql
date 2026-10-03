-- 006_link_sessions: how a session started. Someone who signed in with a
-- one-time link (invite or reset handed out by a host or the admin) may set
-- a new password without the old one for a short while; see setPassword.
ALTER TABLE core.sessions
  ADD COLUMN via text NOT NULL DEFAULT 'password' CHECK (via IN ('password', 'link'));
