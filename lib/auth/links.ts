import 'server-only';
import { sql } from '../db';
import { hashToken, newToken } from './tokens';

export type LinkPurpose = 'login' | 'invite';

const TTL_MINUTES: Record<LinkPurpose, number> = { login: 20, invite: 7 * 24 * 60 };

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Creates a single-use sign-in link. Older unused links of the same kind stop working. */
export async function issueLink(userId: string, purpose: LinkPurpose): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + TTL_MINUTES[purpose] * 60_000);
  await sql.begin(async (tx) => {
    await tx`UPDATE core.login_tokens SET used_at = now()
              WHERE user_id = ${userId} AND purpose = ${purpose} AND used_at IS NULL`;
    await tx`INSERT INTO core.login_tokens (user_id, token_hash, purpose, expires_at)
             VALUES (${userId}, ${hashToken(token)}, ${purpose}, ${expires})`;
  });
  return `${appUrl()}/auth/link?token=${encodeURIComponent(token)}`;
}

/** Who a link is for, without using it (for the confirm page). */
export interface LinkPeek { display_name: string; username: string; purpose: LinkPurpose; has_password: boolean; inviter: string | null }
export async function peekLink(token: string): Promise<LinkPeek | null> {
  const rows = await sql<LinkPeek[]>`
    SELECT u.display_name, u.username, t.purpose, (u.password_hash IS NOT NULL) AS has_password, inv.display_name AS inviter
      FROM core.login_tokens t JOIN core.users u ON u.id = t.user_id
      LEFT JOIN core.users inv ON inv.id = u.created_by
     WHERE t.token_hash = ${hashToken(token)} AND t.used_at IS NULL AND t.expires_at > now() AND u.is_active`;
  return rows[0] ?? null;
}

/** Marks the link used and returns its user and purpose, atomically. */
export async function consumeLink(token: string): Promise<{ userId: string; purpose: LinkPurpose } | null> {
  const rows = await sql<{ user_id: string; purpose: LinkPurpose }[]>`
    UPDATE core.login_tokens t SET used_at = now()
      FROM core.users u
     WHERE u.id = t.user_id AND u.is_active
       AND t.token_hash = ${hashToken(token)} AND t.used_at IS NULL AND t.expires_at > now()
    RETURNING t.user_id, t.purpose`;
  return rows[0] ? { userId: rows[0].user_id, purpose: rows[0].purpose } : null;
}
