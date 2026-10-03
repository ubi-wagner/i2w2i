import 'server-only';
import { sql } from '../db';
import { canResetPassword, normalizeUsername, type PlatformRole } from '../access';
import { hashPassword, passwordProblem } from './password';
import { revokeAllSessions } from './session';
import { suggestPassword } from './suggest';

// Accounts are made by the person inviting: they pick a username and a
// starting password (one is suggested) and pass both on themselves. There's
// no email. The new person can change the password on their account page.

/** What the inviter hands over. */
export interface Credentials { name: string; username: string; password: string }

export interface NewAccount {
  name: string;
  username: string;
  /** Left empty, one is made up. */
  password: string;
  platformRole: PlatformRole;
  createdBy: string;
}

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === '23505';

async function takenMessage(username: string): Promise<string> {
  const [{ free }] = await sql<{ free: string }[]>`SELECT core.free_username(${username}) AS free`;
  return `Someone already has the username “${username}”. Try “${free}”.`;
}

/** Makes a family account that can open Events. Returns its id and the credentials, or what's wrong. */
export async function createAccount(a: NewAccount): Promise<{ id: string; credentials: Credentials } | { error: string }> {
  const name = a.name.trim().slice(0, 80);
  if (!name) return { error: 'Enter their name.' };
  const username = normalizeUsername(a.username);
  if (!username) return { error: 'Usernames are 2 to 32 letters or numbers (dots, dashes and _ are fine), like “grandma.rose”.' };
  const password = a.password.trim() || suggestPassword();
  const problem = passwordProblem(password);
  if (problem) return { error: `Starting password: ${problem}` };

  const [taken] = await sql`SELECT 1 FROM core.users WHERE username = ${username}`;
  if (taken) return { error: await takenMessage(username) };
  const hash = await hashPassword(password);
  try {
    const id = await sql.begin(async (tx) => {
      const [u] = await tx<{ id: string }[]>`
        INSERT INTO core.users (username, display_name, platform_role, password_hash, created_by)
        VALUES (${username}, ${name}, ${a.platformRole}, ${hash}, ${a.createdBy}) RETURNING id`;
      await tx`INSERT INTO core.family_members (family_id, user_id) SELECT id, ${u!.id} FROM core.families`;
      // Everyone starts with Events; creators can make their own.
      await tx`INSERT INTO core.user_app_roles (user_id, app_key, role, granted_by)
               VALUES (${u!.id}, 'events', ${a.platformRole === 'member' ? 'viewer' : 'editor'}, ${a.createdBy})`;
      return u!.id;
    });
    return { id, credentials: { name, username, password } };
  } catch (err) {
    // Two people grabbed the same username at the same moment.
    if (isUniqueViolation(err)) return { error: await takenMessage(username) };
    throw err;
  }
}

/**
 * A new made-up password for someone who forgot theirs, if `actor` may
 * (canResetPassword). Signs them out everywhere, like any password change.
 */
export async function resetPassword(actor: { id: string; platform_role: PlatformRole }, targetId: string): Promise<Credentials | { error: string }> {
  const [target] = await sql<{ id: string; display_name: string; username: string; platform_role: PlatformRole; created_by: string | null; is_active: boolean }[]>`
    SELECT id, display_name, username, platform_role, created_by, is_active FROM core.users WHERE id = ${targetId}`;
  if (!target || !canResetPassword(actor, target)) return { error: 'Only Eric can reset this person’s password.' };
  const password = suggestPassword();
  await sql`UPDATE core.users SET password_hash = ${await hashPassword(password)} WHERE id = ${target.id}`;
  await revokeAllSessions(target.id);
  return { name: target.display_name, username: target.username, password };
}
