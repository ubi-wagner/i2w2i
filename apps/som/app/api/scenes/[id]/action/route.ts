import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, podMembers, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { cancelTimers, scheduleCheckin } from '@/lib/server/scheduler';
import { allAgreed, sceneTransition, type SceneAction } from '@/lib/rules';
import { CHECKIN_CHOICES } from '@/lib/plan';

export const dynamic = 'force-dynamic';
const ACTIONS: SceneAction[] = ['propose', 'withdraw', 'start', 'inspect', 'aftercare', 'close'];

// Moving a scene along: the follow proposes, the lead starts it (with the
// tasks the phone built from the plan), inspects and moves to aftercare, and
// it closes once everyone has said they're back to "us".
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const { scene, role } = found;
  const b = await body<{ action?: unknown; tasks?: unknown; planEnc?: unknown; checkinMinutes?: unknown }>(req);
  const action = b?.action as SceneAction;
  if (!ACTIONS.includes(action)) return bad('Unknown action.');
  const next = sceneTransition(scene.status, action, role);
  if (!next) return bad('That can’t be done now.', 409);
  const name = await nameOf(me.id);
  const url = `/scene/${id}`;

  if (action === 'start') {
    const tasks = Array.isArray(b?.tasks) ? (b!.tasks as { id?: unknown; ord?: unknown; bodyEnc?: unknown; minutes?: unknown }[]) : null;
    if (!tasks || tasks.length > 150 || !tasks.every((t) => isUuid(t.id) && Number.isInteger(t.ord) && isCipher(t.bodyEnc, 'j1', 50_000) && (t.minutes == null || (Number.isInteger(t.minutes) && (t.minutes as number) >= 1 && (t.minutes as number) <= 1440)))) {
      return bad('That doesn’t look like a task list.');
    }
    if (b?.planEnc != null && !isCipher(b.planEnc, 'j1', 200_000)) return bad('That doesn’t look like a plan.');
    const every = typeof b?.checkinMinutes === 'number' && CHECKIN_CHOICES.includes(b.checkinMinutes) ? b.checkinMinutes : null;
    const ok = await sql.begin(async (tx) => {
      const [s] = await tx`UPDATE som.scenes SET status = 'active', started_at = now(), updated_at = now(),
                                  plan_enc = coalesce(${(b?.planEnc as string) ?? null}, plan_enc), plan_rev = plan_rev + 1
                            WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
      if (!s) return false;
      for (const t of tasks) {
        await tx`INSERT INTO som.tasks (id, scene_id, ord, body_enc, minutes) VALUES (${t.id as string}, ${id}, ${t.ord as number}, ${t.bodyEnc as string}, ${(t.minutes as number) ?? null})`;
      }
      return true;
    });
    if (!ok) return bad('Someone else just changed this scene.', 409);
    await scheduleCheckin(id, every);
    notifySoon(await others(scene.pod_id, me.id), { title: 'S-O-M', body: `${name} started the scene.`, url, tag: `scene-${id}` });
    return json({ status: 'active' });
  }

  if (action === 'close') {
    const votes = Array.from(new Set([...scene.close_votes, me.id]));
    const members = (await podMembers(scene.pod_id)).map((m) => m.account_id);
    const closing = allAgreed(votes, members);
    await sql`UPDATE som.scenes SET close_votes = ${votes}, status = ${closing ? 'closed' : scene.status},
                     closed_at = ${closing ? new Date() : null}, updated_at = now() WHERE id = ${id}`;
    if (closing) await cancelTimers(id);
    notifySoon(await others(scene.pod_id, me.id), { title: 'S-O-M', body: closing ? 'The scene is closed. Back to us.' : `${name} is back to “us”.`, url, tag: `scene-${id}` });
    return json({ status: closing ? 'closed' : scene.status, votes });
  }

  const [s] = await sql`UPDATE som.scenes SET status = ${next}, updated_at = now() WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
  if (!s) return bad('Someone else just changed this scene.', 409);
  if (next === 'inspection' || next === 'aftercare') await cancelTimers(id, ['checkin_due', 'checkin_overdue', 'task_due']);
  const message = {
    propose: `${name} sent you a scene to look at.`,
    withdraw: `${name} took their scene back to work on it.`,
    inspect: 'Inspection time.',
    aftercare: 'Time for aftercare.',
  }[action as 'propose' | 'withdraw' | 'inspect' | 'aftercare'];
  notifySoon(await others(scene.pod_id, me.id), { title: 'S-O-M', body: message, url, tag: `scene-${id}` });
  return json({ status: next });
}
