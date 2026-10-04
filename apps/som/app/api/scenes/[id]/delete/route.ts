import { audit } from '@/lib/server/auth';
import { bad, body, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, podMembers, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { abortMultipart, deleteObject } from '@/lib/server/storage';
import { allAgreed } from '@/lib/rules';

export const dynamic = 'force-dynamic';

// A whole scene goes only when everyone in the pod agrees. Each person's
// "yes" is kept until they take it back or the last one arrives. A draft
// that hasn't been sent or started is just its author's.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const { scene } = found;
  const b = await body<{ agree?: unknown }>(req);
  const agree = b?.agree === true;
  // The vote is changed in the database, so two at the same moment both count.
  const [row] = agree
    ? await sql<{ delete_votes: string[] }[]>`UPDATE som.scenes SET delete_votes = array_append(array_remove(delete_votes, ${me.id}::uuid), ${me.id}::uuid) WHERE id = ${id} RETURNING delete_votes`
    : await sql<{ delete_votes: string[] }[]>`UPDATE som.scenes SET delete_votes = array_remove(delete_votes, ${me.id}::uuid) WHERE id = ${id} RETURNING delete_votes`;
  if (!row) return bad('Not found', 404);
  const votes = row.delete_votes;
  const solo = scene.status === 'draft' && scene.created_by === me.id;
  const members = solo ? [me.id] : (await podMembers(scene.pod_id)).map((m) => m.account_id);
  const name = await nameOf(me.id);
  if (!agree || !allAgreed(votes, members)) {
    if (agree) notifySoon(await others(scene, me.id), { title: 'S-O-M', body: `${name} would like to delete a scene. It goes once you agree too.`, url: `/scene/${id}`, tag: `delete-${id}` });
    return json({ deleted: false, votes });
  }
  const media = await sql<{ object_key: string; thumb_key: string | null; upload_id: string | null; status: string }[]>`
    SELECT object_key, thumb_key, upload_id, status FROM som.media WHERE scene_id = ${id}`;
  for (const m of media) {
    if (m.status === 'uploading' && m.upload_id) await abortMultipart(m.object_key, m.upload_id);
    await deleteObject(m.object_key).catch(() => {});
    if (m.thumb_key) await deleteObject(m.thumb_key).catch(() => {});
  }
  // Whoever's yes came last at the same moment as another's: deleted once, told once.
  const [gone] = await sql`DELETE FROM som.scenes WHERE id = ${id} RETURNING 1`;
  if (!gone) return json({ deleted: true });
  await audit(me.id, 'scene.delete', id);
  if (!solo) notifySoon(await others(scene, me.id), { title: 'S-O-M', body: 'A scene was deleted, as you both agreed.', url: '/', tag: `delete-${id}` });
  return json({ deleted: true });
}
