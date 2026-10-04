import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, podMembers, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { cancelTimers, scheduleCheckin, scheduleSceneStart } from '@/lib/server/scheduler';
import { allAgreed, sceneTransition, type SceneAction } from '@/lib/rules';
import { CHECKIN_CHOICES } from '@/lib/plan';

export const dynamic = 'force-dynamic';
const ACTIONS: SceneAction[] = [
  'propose', 'withdraw', 'start', 'inspect', 'aftercare', 'close',
  'offer', 'accept', 'request_change', 'agree_change', 'cancel', 'send', 'unsend',
];

type Body = {
  action?: unknown; tasks?: unknown; planEnc?: unknown; checkinMinutes?: unknown;
  startsAt?: unknown; hours?: unknown; noteEnc?: unknown;
};
type TaskIn = { id?: unknown; ord?: unknown; bodyEnc?: unknown; minutes?: unknown };

const DAY = 86_400_000;
/** A start time from a phone: a real time, not long past, not far off. */
function startTime(v: unknown): Date | null | undefined {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) && t > Date.now() - DAY && t < Date.now() + 120 * DAY ? d : undefined;
}
const hoursOf = (v: unknown) => (v == null ? null : Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 48 ? (v as number) : undefined);

function taskList(v: unknown): TaskIn[] | null {
  const tasks = Array.isArray(v) ? (v as TaskIn[]) : null;
  if (!tasks || !tasks.length || tasks.length > 150) return null;
  const ok = tasks.every((t) => isUuid(t.id) && Number.isInteger(t.ord) && isCipher(t.bodyEnc, 'j1', 50_000)
    && (t.minutes == null || (Number.isInteger(t.minutes) && (t.minutes as number) >= 1 && (t.minutes as number) <= 1440)));
  return ok ? tasks : null;
}

// Moving a scene along. The follow drafts and proposes and the lead starts
// it now; or the lead offers a day, the follow accepts or asks for a change,
// the lead builds and sends it, and the follow starts it. Then inspection,
// aftercare, and it closes once everyone is back to "us". Tasks are made
// on the phone (encrypted) and arrive with "start" or "send".
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  const { scene, role } = found;
  const b = await body<Body>(req);
  const action = b?.action as SceneAction;
  if (!ACTIONS.includes(action)) return bad('Unknown action.');
  const next = sceneTransition(scene.status, action, role);
  if (!next) return bad('That can’t be done now.', 409);
  const name = await nameOf(me.id);
  const url = `/scene/${id}`;
  const tell = async (body: string, onlyRole?: 'lead' | 'follow') =>
    notifySoon(await others(scene.pod_id, me.id, onlyRole), { title: 'S-O-M', body, url, tag: `scene-${id}` });
  if (b?.planEnc != null && !isCipher(b.planEnc, 'j1', 200_000)) return bad('That doesn’t look like a plan.');
  const planEnc = (b?.planEnc as string | undefined) ?? null;
  const every = typeof b?.checkinMinutes === 'number' && CHECKIN_CHOICES.includes(b.checkinMinutes) ? b.checkinMinutes : null;

  // Changes only if nobody else moved the scene first.
  const move = async (fields?: ReturnType<typeof sql>) => {
    const [s] = fields
      ? await sql`UPDATE som.scenes SET status = ${next}, updated_at = now(), ${fields} WHERE id = ${id} AND status = ${scene.status} RETURNING 1`
      : await sql`UPDATE som.scenes SET status = ${next}, updated_at = now() WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
    return Boolean(s);
  };
  const raced = () => bad('Someone else just changed this scene.', 409);

  switch (action) {
    case 'offer': {
      const startsAt = startTime(b?.startsAt);
      const hours = hoursOf(b?.hours);
      if (!startsAt || !hours) return bad('Pick a day, a time and how long.');
      if (!(await move(sql`starts_at = ${startsAt}, hours = ${hours}, change_request = NULL,
                           plan_enc = coalesce(${planEnc}, plan_enc), plan_rev = plan_rev + ${planEnc ? 1 : 0}`))) return raced();
      await tell(`${name} offered you a scene.`, 'follow');
      return json({ status: next });
    }
    case 'accept': {
      if (!(await move(sql`change_request = NULL`))) return raced();
      await tell(`${name} accepted your offer.`, 'lead');
      return json({ status: next });
    }
    case 'request_change': {
      const startsAt = startTime(b?.startsAt);
      const hours = hoursOf(b?.hours);
      const noteOk = b?.noteEnc == null || isCipher(b.noteEnc, 'j1', 8_000);
      if (startsAt === undefined || hours === undefined || !noteOk || (!startsAt && !hours && b?.noteEnc == null)) return bad('Say what you’d like changed.');
      const request = { by: me.id, startsAt: startsAt?.toISOString() ?? null, hours, noteEnc: (b?.noteEnc as string) ?? null };
      if (!(await move(sql`change_request = ${sql.json(request)}`))) return raced();
      await tell(`${name} asked for a change.`, 'lead');
      return json({ status: next });
    }
    case 'agree_change': {
      const cr = scene.change_request;
      if (!cr) return bad('There’s no change to agree to.', 409);
      const startsAt = startTime(cr.startsAt) ?? scene.starts_at;
      // The lead's phone sends the plan back with pacing for the new length.
      if (!(await move(sql`starts_at = ${startsAt ?? null}, hours = ${cr.hours ?? scene.hours}, change_request = NULL,
                           plan_enc = coalesce(${planEnc}, plan_enc), plan_rev = plan_rev + ${planEnc ? 1 : 0}`))) return raced();
      await tell(`${name} agreed to your change.`, 'follow');
      return json({ status: next });
    }
    case 'cancel': {
      if (!(await move(sql`change_request = NULL`))) return raced();
      await cancelTimers(id);
      await tell(`${name} took back the offer.`, 'follow');
      return json({ status: next });
    }
    case 'send': {
      const tasks = taskList(b?.tasks);
      if (!tasks) return bad('That doesn’t look like a task list.');
      const ok = await sql.begin(async (tx) => {
        const [s] = await tx`UPDATE som.scenes SET status = 'ready', updated_at = now(), checkin_minutes = ${every},
                                    plan_enc = coalesce(${planEnc}, plan_enc), plan_rev = plan_rev + 1
                              WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
        if (!s) return false;
        await tx`DELETE FROM som.tasks WHERE scene_id = ${id}`;
        for (const t of tasks) {
          await tx`INSERT INTO som.tasks (id, scene_id, ord, body_enc, minutes) VALUES (${t.id as string}, ${id}, ${t.ord as number}, ${t.bodyEnc as string}, ${(t.minutes as number) ?? null})`;
        }
        return true;
      });
      if (!ok) return raced();
      if (scene.starts_at && scene.starts_at.getTime() > Date.now()) await scheduleSceneStart(id, scene.starts_at);
      await tell(`${name} sent your scene.`, 'follow');
      return json({ status: next });
    }
    case 'unsend': {
      const ok = await sql.begin(async (tx) => {
        const [s] = await tx`UPDATE som.scenes SET status = 'accepted', updated_at = now() WHERE id = ${id} AND status = 'ready' RETURNING 1`;
        if (!s) return false;
        await tx`DELETE FROM som.tasks WHERE scene_id = ${id}`;
        return true;
      });
      if (!ok) return raced();
      await cancelTimers(id, ['scene_start']);
      await tell(`${name} took the scene back to change it.`, 'follow');
      return json({ status: next });
    }
    case 'start': {
      if (scene.status === 'ready') {
        // Sent earlier: the tasks are already there.
        if (!(await move(sql`started_at = now()`))) return raced();
        await cancelTimers(id, ['scene_start']);
        await scheduleCheckin(id, scene.checkin_minutes);
        await tell(`${name} started the scene.`);
        return json({ status: 'active' });
      }
      const tasks = taskList(b?.tasks);
      if (!tasks) return bad('That doesn’t look like a task list.');
      const ok = await sql.begin(async (tx) => {
        const [s] = await tx`UPDATE som.scenes SET status = 'active', started_at = now(), updated_at = now(),
                                    plan_enc = coalesce(${planEnc}, plan_enc), plan_rev = plan_rev + 1
                              WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
        if (!s) return false;
        for (const t of tasks) {
          await tx`INSERT INTO som.tasks (id, scene_id, ord, body_enc, minutes) VALUES (${t.id as string}, ${id}, ${t.ord as number}, ${t.bodyEnc as string}, ${(t.minutes as number) ?? null})`;
        }
        return true;
      });
      if (!ok) return raced();
      await scheduleCheckin(id, every);
      await tell(`${name} started the scene.`);
      return json({ status: 'active' });
    }
    case 'close': {
      const votes = Array.from(new Set([...scene.close_votes, me.id]));
      const members = (await podMembers(scene.pod_id)).map((m) => m.account_id);
      const closing = allAgreed(votes, members);
      await sql`UPDATE som.scenes SET close_votes = ${votes}, status = ${closing ? 'closed' : scene.status},
                       closed_at = ${closing ? new Date() : null}, updated_at = now() WHERE id = ${id}`;
      if (closing) await cancelTimers(id);
      await tell(closing ? 'The scene is closed. Back to us.' : `${name} is back to “us”.`);
      return json({ status: closing ? 'closed' : scene.status, votes });
    }
    default: {
      if (!(await move())) return raced();
      if (next === 'inspection' || next === 'aftercare') await cancelTimers(id, ['checkin_due', 'checkin_overdue', 'task_due']);
      const message = {
        propose: `${name} sent you a scene to look at.`,
        withdraw: `${name} took their scene back to work on it.`,
        inspect: 'Inspection time.',
        aftercare: 'Time for aftercare.',
      }[action as 'propose' | 'withdraw' | 'inspect' | 'aftercare'];
      await tell(message);
      return json({ status: next });
    }
  }
}
