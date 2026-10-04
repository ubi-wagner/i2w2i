import { audit } from '@/lib/server/auth';
import { bad, body, guard, isCipher, isUuid, isWrapped, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Starting a pod: the phone made the pod key, encrypted the settings and the
// starter menu with it, and wrapped it with this person's vault passphrase.
export async function POST(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const b = await body<{ id?: unknown; role?: unknown; settingsEnc?: unknown; menuEnc?: unknown; keyBackup?: unknown }>(req);
  if (!b || !isUuid(b.id) || (b.role !== 'lead' && b.role !== 'follow') || !isCipher(b.settingsEnc, 'j1') || !isCipher(b.menuEnc, 'j1') || !isWrapped(b.keyBackup, true)) {
    return bad('That doesn’t look like a new pod.');
  }
  const [mine] = await sql`SELECT 1 FROM som.members WHERE account_id = ${me.id}`;
  if (mine && !me.is_admin) return bad('You’re already in a pod.');
  await sql.begin(async (tx) => {
    await tx`INSERT INTO som.pods (id, created_by, settings_enc, menu_enc) VALUES (${b.id as string}, ${me.id}, ${b.settingsEnc as string}, ${b.menuEnc as string})`;
    await tx`INSERT INTO som.members (pod_id, account_id, role, key_backup, added_by) VALUES (${b.id as string}, ${me.id}, ${b.role as string}, ${tx.json(b.keyBackup as never)}, ${me.id})`;
  });
  await audit(me.id, 'pod.create', b.id as string);
  return json({ ok: true });
}
