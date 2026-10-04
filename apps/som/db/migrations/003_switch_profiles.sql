-- Switching who leads, offers either way, and profiles.
--
-- A scene can be switched: the member who usually follows leads it, and the
-- one who usually leads follows. Everything a role may do in that scene
-- follows the switch. Either member can offer (or ask for) a scene; the
-- other one answers it. Whether a scene is switched is the server's to know
-- (it decides who may do what); what's in it stays encrypted.

ALTER TABLE som.scenes
  ADD COLUMN switched   boolean NOT NULL DEFAULT false,
  ADD COLUMN offered_by uuid REFERENCES som.accounts(id) ON DELETE SET NULL;

-- Offers made before this were the lead's.
UPDATE som.scenes s
   SET offered_by = (SELECT m.account_id FROM som.members m WHERE m.pod_id = s.pod_id AND m.role = 'lead' ORDER BY m.joined_at LIMIT 1)
 WHERE s.starts_at IS NOT NULL;

-- Each member's profile in a pod: what they like (giving and receiving),
-- their limits and notes. Encrypted with the pod key, so the pod can read
-- it and the server can't.
CREATE TABLE som.profiles (
  pod_id     uuid NOT NULL,
  account_id uuid NOT NULL,
  body_enc   text NOT NULL,
  rev        integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pod_id, account_id),
  FOREIGN KEY (pod_id, account_id) REFERENCES som.members (pod_id, account_id) ON DELETE CASCADE
);
