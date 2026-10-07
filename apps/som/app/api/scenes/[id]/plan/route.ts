import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { sceneFor } from '@/lib/server/pods';
import { ownsDraft, sceneTransition } from '@/lib/rules';

export const dynamic = 'force-dynamic';

/** Saves the (encrypted) plan while it can still change, unless someone saved a newer one. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  if (!sceneTransition(found.scene.status, 'edit', found.role)) return bad('This scene can’t be changed now.', 409);
  if (!ownsDraft(found.scene.status, found.scene.created_by, me.id)) return bad('It’s their draft: only they can change it until it’s sent.', 403);
  const b = await body<{ planEnc?: unknown; rev?: unknown }>(req);
  if (!isCipher(b?.planEnc, 'j1', 200_000) || !Number.isInteger(b?.rev)) return bad('That doesn’t look like a plan.');
  const [row] = await sql<{ plan_rev: number }[]>`
    UPDATE som.scenes SET plan_enc = ${b!.planEnc as string}, plan_rev = plan_rev + 1, updated_at = now()
     WHERE id = ${id} AND plan_rev = ${b!.rev as number} AND status = ${found.scene.status} RETURNING plan_rev`;
  if (!row) {
    const [cur] = await sql`SELECT plan_enc, plan_rev, status FROM som.scenes WHERE id = ${id}`;
    return json({ error: 'Someone else changed this scene. Here’s their version.', current: cur }, 409);
  }
  return json({ rev: row.plan_rev });
}
