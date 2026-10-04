import { audit, hashPassword, revokeAll } from '@/lib/server/auth';
import { bad, body, guard, isUuid, isWrapped, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { podRole } from '@/lib/server/pods';
import { suggestPassword } from '@/lib/suggest';

export const dynamic = 'force-dynamic';

// For a partner who lost their phone and forgot their vault passphrase (a new
// key link), or their password (a new made-up one). Only for accounts you
// added yourself, like the family site's resets.
export async function POST(req: Request, { params }: { params: Promise<{ podId: string; accountId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId, accountId } = await params;
  if (!isUuid(podId) || !isUuid(accountId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const [target] = await sql<{ username: string; display_name: string; created_by: string | null }[]>`
    SELECT a.username, a.display_name, a.created_by FROM som.members m JOIN som.accounts a ON a.id = m.account_id
     WHERE m.pod_id = ${podId} AND m.account_id = ${accountId} AND a.is_active`;
  if (!target || accountId === me.id || (target.created_by !== me.id && !me.is_admin)) return bad('Only the person who added them can do that.', 403);
  const b = await body<{ invite?: unknown; resetPassword?: unknown }>(req);
  if (!isWrapped(b?.invite)) return bad('That doesn’t look like an invite.');
  await sql`UPDATE som.members SET invite = ${sql.json(b!.invite as never)} WHERE pod_id = ${podId} AND account_id = ${accountId}`;
  let password: string | undefined;
  if (b?.resetPassword === true) {
    password = suggestPassword();
    await sql`UPDATE som.accounts SET password_hash = ${await hashPassword(password)} WHERE id = ${accountId}`;
    await revokeAll(accountId);
  }
  await audit(me.id, password ? 'member.reset' : 'member.reinvite', accountId);
  return json({ credentials: { name: target.display_name, username: target.username, password } });
}
