import { bad, body, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { pauseTimers, restoreArrival, resumeTimers } from '@/lib/server/scheduler';

export const dynamic = 'force-dynamic';

// The pause button: either of you, any time. Everything stops (tasks, timers,
// check-ins) and the other phone hears about it straight away. Only whoever
// paused can resume, so a pause is never overruled.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const { scene } = found;
  if (scene.status === 'closed') return bad('This scene is closed.', 409);
  const b = await body<{ paused?: unknown }>(req);
  const name = await nameOf(me.id);
  const url = `/scene/${id}`;
  if (b?.paused === true) {
    if (scene.paused_at) return json({ paused: true });
    // Two pauses at the same moment: the first one counts (and only its maker resumes).
    const [won] = await sql`UPDATE som.scenes SET paused_at = now(), paused_by = ${me.id}, updated_at = now() WHERE id = ${id} AND paused_at IS NULL RETURNING 1`;
    if (!won) return json({ paused: true });
    await pauseTimers(id);
    notifySoon(await others(scene, me.id), { title: 'S-O-M · Paused', body: `${name} paused the scene.`, url, tag: `pause-${id}` });
    return json({ paused: true });
  }
  if (!scene.paused_at) return json({ paused: false });
  if (scene.paused_by && scene.paused_by !== me.id) return bad('Only the person who paused can resume.', 403);
  await sql`UPDATE som.scenes SET paused_at = NULL, paused_by = NULL, updated_at = now() WHERE id = ${id}`;
  if (scene.status === 'active') await resumeTimers(id, scene.paused_at);
  await restoreArrival(id);
  notifySoon(await others(scene, me.id), { title: 'S-O-M', body: `${name} resumed the scene.`, url, tag: `pause-${id}` });
  return json({ paused: false });
}
