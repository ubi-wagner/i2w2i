import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { podRole } from '@/lib/server/pods';

export const dynamic = 'force-dynamic';

/** Saves the (encrypted) menu, unless someone else saved a newer one meanwhile. */
export async function PUT(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  if (!isUuid(podId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const b = await body<{ menuEnc?: unknown; rev?: unknown }>(req);
  if (!isCipher(b?.menuEnc, 'j1', 1_000_000) || !Number.isInteger(b?.rev)) return bad('That doesn’t look like a menu.');
  const [row] = await sql<{ menu_rev: number }[]>`
    UPDATE som.pods SET menu_enc = ${b!.menuEnc as string}, menu_rev = menu_rev + 1
     WHERE id = ${podId} AND menu_rev = ${b!.rev as number} RETURNING menu_rev`;
  if (!row) {
    const [cur] = await sql<{ menu_enc: string; menu_rev: number }[]>`SELECT menu_enc, menu_rev FROM som.pods WHERE id = ${podId}`;
    return json({ error: 'Someone else changed the menu. Here’s their version.', current: cur }, 409);
  }
  return json({ rev: row.menu_rev });
}
