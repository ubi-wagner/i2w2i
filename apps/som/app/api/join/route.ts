import { audit } from '@/lib/server/auth';
import { bad, body, guard, isUuid, isWrapped, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Joining from a key link: the phone fetches the invite-wrapped pod key,
// opens it with the secret from the link's #fragment, and sends back the key
// wrapped with the person's own vault passphrase. The invite is then gone.
export async function GET(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const rows = await sql<{ pod_id: string; invite: unknown }[]>`SELECT pod_id, invite FROM som.members WHERE account_id = ${me.id} AND invite IS NOT NULL`;
  return json({ invites: rows });
}

export async function POST(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const b = await body<{ podId?: unknown; keyBackup?: unknown }>(req);
  if (!isUuid(b?.podId) || !isWrapped(b?.keyBackup, true)) return bad('That doesn’t look right.');
  const done = await sql`UPDATE som.members SET key_backup = ${sql.json(b!.keyBackup as never)}, invite = NULL
                          WHERE pod_id = ${b!.podId as string} AND account_id = ${me.id} AND invite IS NOT NULL RETURNING 1`;
  if (!done.length) return bad('That key link was already used. Ask for a new one.', 409);
  await audit(me.id, 'member.join', b!.podId as string);
  return json({ ok: true });
}
