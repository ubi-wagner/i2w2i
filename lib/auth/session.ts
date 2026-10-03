import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '../db';
import type { PlatformRole } from '../access';
import { hashToken, newToken } from './tokens';

export const SESSION_COOKIE = 'i2w2i_session';
/** Sliding: each visit (at most hourly) pushes expiry this far out again. */
export const SESSION_DAYS = 90;

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  platform_role: PlatformRole;
  has_password: boolean;
  /** Signed in with a one-time link in the last 30 minutes: may reset the password without the old one. */
  fresh_link: boolean;
}

export async function createSession(userId: string, via: 'password' | 'link' = 'password'): Promise<void> {
  const token = newToken();
  const h = await headers();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql`
    INSERT INTO core.sessions (user_id, token_hash, expires_at, via, user_agent, ip)
    VALUES (${userId}, ${hashToken(token)}, ${expires}, ${via}, ${h.get('user-agent')?.slice(0, 300) ?? null},
            ${h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null})`;
  await sql`UPDATE core.users SET last_login_at = now() WHERE id = ${userId}`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

/** The signed-in person, or null. Checked against the DB on every request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await sql<(CurrentUser & { session_id: string; stale: boolean })[]>`
    SELECT u.id, u.email, u.display_name, u.platform_role, (u.password_hash IS NOT NULL) AS has_password,
           (s.via = 'link' AND s.created_at > now() - interval '30 minutes') AS fresh_link,
           s.id AS session_id, (s.last_seen_at < now() - interval '1 hour') AS stale
      FROM core.sessions s JOIN core.users u ON u.id = s.user_id
     WHERE s.token_hash = ${hashToken(token)}
       AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`;
  const row = rows[0];
  if (!row) return null;
  // Someone who keeps using the app stays signed in; the cookie is renewed in proxy.ts.
  if (row.stale) {
    await sql`UPDATE core.sessions SET last_seen_at = now(),
                     expires_at = greatest(expires_at, now() + make_interval(days => ${SESSION_DAYS}))
               WHERE id = ${row.session_id}`;
  }
  const { session_id: _s, stale: _st, ...user } = row;
  return user;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.platform_role !== 'admin') redirect('/');
  return user;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`UPDATE core.sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL`;
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await sql`UPDATE core.sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
}
