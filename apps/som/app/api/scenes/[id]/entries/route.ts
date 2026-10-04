import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { scheduleCheckin } from '@/lib/server/scheduler';
import type { Role, SceneStatus } from '@/lib/rules';

export const dynamic = 'force-dynamic';

type Kind = 'comment' | 'writing' | 'checkin' | 'scores' | 'outcomes' | 'aftercare' | 'reflection' | 'praise';

/** Who may add each kind of entry, and when. */
function allowed(kind: Kind, role: Role, status: SceneStatus): boolean {
  switch (kind) {
    case 'comment': return status !== 'closed';
    case 'writing': return role === 'follow' && status === 'active';
    case 'checkin': return role === 'follow' && status === 'active';
    case 'scores':
    case 'outcomes': return role === 'lead' && (status === 'inspection' || status === 'aftercare');
    case 'aftercare': return status === 'aftercare';
    case 'reflection': return status === 'aftercare' || status === 'closed';
    case 'praise': return role === 'lead' && status !== 'closed';
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const { scene, role } = found;
  const b = await body<{ id?: unknown; kind?: unknown; taskId?: unknown; bodyEnc?: unknown; private?: unknown }>(req);
  const kind = b?.kind as Kind;
  if (!['comment', 'writing', 'checkin', 'scores', 'outcomes', 'aftercare', 'reflection', 'praise'].includes(kind)) return bad('Unknown kind.');
  if (!isUuid(b?.id) || !isCipher(b?.bodyEnc, 'j1', 300_000)) return bad('That doesn’t look right.');
  if (!allowed(kind, role, scene.status)) return bad('That can’t be added now.', 409);
  const taskId = b?.taskId == null ? null : isUuid(b.taskId) ? b.taskId : undefined;
  if (taskId === undefined) return bad('Unknown task.');
  if (taskId) {
    const [t] = await sql`SELECT 1 FROM som.tasks WHERE id = ${taskId} AND scene_id = ${id}`;
    if (!t) return bad('Unknown task.');
  }
  const priv = kind === 'reflection' && b?.private === true;
  await sql`INSERT INTO som.entries (id, scene_id, task_id, author_id, kind, body_enc, private)
            VALUES (${b!.id as string}, ${id}, ${taskId}, ${me.id}, ${kind}, ${b!.bodyEnc as string}, ${priv})`;
  await sql`UPDATE som.scenes SET updated_at = now() WHERE id = ${id}`;

  const name = await nameOf(me.id);
  const url = `/scene/${id}${taskId ? `#task-${taskId}` : ''}`;
  if (kind === 'checkin') {
    // Checking in starts the clock again (and clears the missed-check-in alarm);
    // a block end only minutes away counts as done.
    if (!scene.paused_at) await scheduleCheckin(id, true);
    notifySoon(await others(scene, me.id, 'lead'), { title: 'S-O-M', body: `${name} checked in.`, url, tag: `checkin-${id}` });
  } else if (kind === 'praise') {
    notifySoon(await others(scene, me.id), { title: 'S-O-M', body: `${name} praised you. ✨`, url, tag: `praise-${id}` });
  } else if (kind === 'comment') {
    notifySoon(await others(scene, me.id), { title: 'S-O-M', body: `New note from ${name}.`, url, tag: `note-${id}` });
  } else if (kind === 'scores' || kind === 'outcomes') {
    notifySoon(await others(scene, me.id), { title: 'S-O-M', body: `${name} finished the inspection.`, url, tag: `scene-${id}` });
  }
  return json({ ok: true });
}
