import { bad, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { sceneFor, sceneMembers } from '@/lib/server/pods';

export const dynamic = 'force-dynamic';

// Everything a phone needs to show a scene (ciphertext throughout). Private
// reflections only go to the person who wrote them.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const [members, tasks, entries, media] = await Promise.all([
    sceneMembers(found.scene),
    sql`SELECT id, ord, status, body_enc, minutes, due_at, started_at, submitted_at, decided_at, updated_at FROM som.tasks WHERE scene_id = ${id} ORDER BY ord`,
    sql`SELECT id, task_id, author_id, kind, body_enc, private, created_at FROM som.entries
         WHERE scene_id = ${id} AND (NOT private OR author_id = ${me.id}) ORDER BY created_at`,
    sql`SELECT id, task_id, entry_id, uploader_id, bytes, thumb_bytes, chunk_bytes, file_key_enc, nonce, thumb_nonce, meta_enc, status, created_at
          FROM som.media WHERE scene_id = ${id} AND (status = 'ready' OR uploader_id = ${me.id}) ORDER BY created_at`,
  ]);
  return json({ scene: found.scene, role: found.role, me: me.id, members, tasks, entries, media, now: new Date() });
}
