import { bad, body, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { cancelTimers, inMinutes, scheduleTask } from '@/lib/server/scheduler';
import { taskTransition, type TaskAction, type TaskStatus } from '@/lib/rules';

export const dynamic = 'force-dynamic';
const ACTIONS: TaskAction[] = ['start', 'submit', 'approve', 'return', 'skip', 'reopen'];

export async function POST(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id, taskId } = await params;
  const found = isUuid(id) && isUuid(taskId) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const { scene, role } = found;
  if (scene.status !== 'active') return bad('Tasks only change while the scene is running.', 409);
  if (scene.paused_at) return bad('The scene is paused.', 409);
  const b = await body<{ action?: unknown }>(req);
  const action = b?.action as TaskAction;
  if (!ACTIONS.includes(action)) return bad('Unknown action.');
  const [task] = await sql<{ status: TaskStatus; minutes: number | null; due_at: Date | null }[]>`
    SELECT status, minutes, due_at FROM som.tasks WHERE id = ${taskId} AND scene_id = ${id}`;
  if (!task) return bad('Not found', 404);
  const next = taskTransition(task.status, action, role);
  if (!next) return bad('That can’t be done now.', 409);

  // A countdown starts when the task does (and again if it's sent back).
  const dueAt = next === 'started' && task.minutes ? inMinutes(task.minutes) : next === 'started' ? null : task.due_at;
  const [row] = await sql`
    UPDATE som.tasks SET status = ${next}, updated_at = now(), due_at = ${dueAt},
           started_at = CASE WHEN ${next} = 'started' THEN now() ELSE started_at END,
           submitted_at = CASE WHEN ${next} = 'submitted' THEN now() ELSE submitted_at END,
           decided_at = CASE WHEN ${next} IN ('approved', 'returned', 'skipped') THEN now() ELSE decided_at END
     WHERE id = ${taskId} AND status = ${task.status} RETURNING 1`;
  if (!row) return bad('Someone else just changed this task.', 409);
  if (next === 'started' && dueAt) await scheduleTask(id, taskId, dueAt);
  else if (next !== 'started') await cancelTimers(id, ['task_due'], taskId);

  const name = await nameOf(me.id);
  const url = `/scene/${id}#task-${taskId}`;
  if (next === 'submitted') notifySoon(await others(scene.pod_id, me.id, 'lead'), { title: 'S-O-M', body: `${name} sent something for review.`, url, tag: `task-${taskId}` });
  if (next === 'approved') notifySoon(await others(scene.pod_id, me.id, 'follow'), { title: 'S-O-M', body: `${name} approved a task. ✓`, url, tag: `task-${taskId}` });
  if (next === 'returned') notifySoon(await others(scene.pod_id, me.id, 'follow'), { title: 'S-O-M', body: `${name} sent a task back.`, url, tag: `task-${taskId}` });
  return json({ status: next, dueAt });
}
