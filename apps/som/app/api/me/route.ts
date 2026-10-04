import { guard, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { podMembers } from '@/lib/server/pods';

export const dynamic = 'force-dynamic';

// Who I am and the pods I'm in, with everything a phone needs to unlock them
// (all of it ciphertext or wrapped keys).
export async function GET(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const pods = await sql<{ id: string; role: string; settings_enc: string; menu_enc: string; menu_rev: number; key_backup: unknown; invite: unknown }[]>`
    SELECT p.id, m.role, p.settings_enc, p.menu_enc, p.menu_rev, m.key_backup, (m.invite IS NOT NULL) AS invite
      FROM som.members m JOIN som.pods p ON p.id = m.pod_id
     WHERE m.account_id = ${me.id}
     ORDER BY p.created_at`;
  const out = [];
  for (const p of pods) out.push({ ...p, members: await podMembers(p.id) });
  return json({ account: me, pods: out });
}
