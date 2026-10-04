import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from './db';

// Sign-in for S-O-M's own accounts (not the family site's). Usernames and
// passwords are handed out by whoever adds someone; sessions slide for 90
// days of use. The cookie belongs to this subdomain only.

export const SESSION_COOKIE = 'som_session';
export const SESSION_DAYS = 90;
export const MIN_PASSWORD_LENGTH = 10;

export interface Account {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
  has_password: boolean;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

let dummyHash: Promise<string> | undefined;
export async function verifyPassword(pw: string, hash: string | null): Promise<boolean> {
  // A miss costs the same time as a hit.
  const ok = await bcrypt.compare(pw, hash ?? (await (dummyHash ??= hashPassword('not-a-real-password'))));
  return ok && hash !== null;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest();

export async function createSession(accountId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql`INSERT INTO som.logins (account_id, token_hash, expires_at) VALUES (${accountId}, ${hashToken(token)}, ${expires})`;
  await sql`UPDATE som.accounts SET last_login_at = now() WHERE id = ${accountId}`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

/** The signed-in account, or null. Checked against the database on every request. */
export const currentAccount = cache(async (): Promise<Account | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await sql<(Account & { login_id: string; stale: boolean })[]>`
    SELECT a.id, a.username, a.display_name, a.is_admin, (a.password_hash IS NOT NULL) AS has_password,
           l.id AS login_id, (l.last_seen_at < now() - interval '1 hour') AS stale
      FROM som.logins l JOIN som.accounts a ON a.id = l.account_id
     WHERE l.token_hash = ${hashToken(token)} AND l.revoked_at IS NULL AND l.expires_at > now() AND a.is_active`;
  if (!row) return null;
  if (row.stale) {
    await sql`UPDATE som.logins SET last_seen_at = now(), expires_at = greatest(expires_at, now() + make_interval(days => ${SESSION_DAYS}))
               WHERE id = ${row.login_id}`;
  }
  const { login_id: _l, stale: _s, ...account } = row;
  return account;
});

export async function requireAccount(): Promise<Account> {
  const a = await currentAccount();
  if (!a) redirect('/login');
  return a;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`UPDATE som.logins SET revoked_at = now() WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL`;
  jar.delete(SESSION_COOKIE);
}

export async function revokeAll(accountId: string): Promise<void> {
  await sql`UPDATE som.logins SET revoked_at = now() WHERE account_id = ${accountId} AND revoked_at IS NULL`;
}

export async function audit(accountId: string | null, action: string, target?: string): Promise<void> {
  await sql`INSERT INTO som.audit_log (account_id, action, target) VALUES (${accountId}, ${action}, ${target ?? null})`;
}
