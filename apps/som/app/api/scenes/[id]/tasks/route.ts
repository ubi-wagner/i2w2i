import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { inMinutes, scheduleTask } from '@/lib/server/scheduler';

export const dynamic = 'force-dynamic';

// A demand: the lead adds a task while the scene runs ("a photo, right now",
// "redo the kitchen"). With minutes, its countdown starts straight away.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const { scene, role } = found;
  if (role !== 'lead' || scene.status !== 'active') return bad('Demands are for the lead while the scene runs.', 409);
  if (scene.paused_at) return bad('The scene is paused.', 409);
  const b = await body<{ id?: unknown; bodyEnc?: unknown; minutes?: unknown }>(req);
  const minutes = b?.minutes == null ? null : Number.isInteger(b.minutes) && (b.minutes as number) >= 1 && (b.minutes as number) <= 1440 ? (b.minutes as number) : undefined;
  if (!isUuid(b?.id) || !isCipher(b?.bodyEnc, 'j1', 50_000) || minutes === undefined) return bad('That doesn’t look like a demand.');
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM som.tasks WHERE scene_id = ${id}`;
  if (n >= 300) return bad('That’s a lot of tasks already.', 409);
  const dueAt = minutes ? inMinutes(minutes) : null;
  await sql`INSERT INTO som.tasks (id, scene_id, ord, body_enc, minutes, status, started_at, due_at)
            VALUES (${b!.id as string}, ${id}, (SELECT coalesce(max(ord), -1) + 1 FROM som.tasks WHERE scene_id = ${id}),
                    ${b!.bodyEnc as string}, ${minutes}, ${dueAt ? 'started' : 'todo'}, ${dueAt ? new Date() : null}, ${dueAt})`;
  if (dueAt) await scheduleTask(id, b!.id as string, dueAt);
  await sql`UPDATE som.scenes SET updated_at = now() WHERE id = ${id}`;
  notifySoon(await others(scene, me.id, 'follow'), {
    title: 'S-O-M', body: `${await nameOf(me.id)} sent you a demand. ⚡`, url: `/scene/${id}#task-${b!.id}`, tag: `task-${b!.id}`,
  });
  return json({ ok: true, dueAt });
}
