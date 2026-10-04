import { audit } from '@/lib/server/auth';
import { bad, body, guard, isUuid, isWrapped, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** A new vault passphrase: the pod key re-wrapped on the phone. */
export async function PUT(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  const b = await body<{ keyBackup?: unknown }>(req);
  if (!isUuid(podId) || !isWrapped(b?.keyBackup, true)) return bad('That doesn’t look right.');
  const done = await sql`UPDATE som.members SET key_backup = ${sql.json(b!.keyBackup as never)} WHERE pod_id = ${podId} AND account_id = ${me.id} RETURNING 1`;
  if (!done.length) return bad('Not found', 404);
  await audit(me.id, 'passphrase.changed', podId);
  return json({ ok: true });
}
