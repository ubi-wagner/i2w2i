import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { nameOf, others, podMembers, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { cancelTimers, scheduleCheckin, scheduleSceneStart } from '@/lib/server/scheduler';
import { allAgreed, sceneRole, sceneTransition, startState, windowProblem, type SceneAction } from '@/lib/rules';
import { CHECKIN_CHOICES } from '@/lib/plan';

export const dynamic = 'force-dynamic';
const ACTIONS: SceneAction[] = [
  'propose', 'withdraw', 'start', 'inspect', 'aftercare', 'close',
  'offer', 'accept', 'accept_send', 'request_change', 'decline', 'agree_change', 'cancel', 'send', 'unsend',
];

type Body = {
  action?: unknown; tasks?: unknown; planEnc?: unknown; checkinMinutes?: unknown;
  startsAt?: unknown; endsAt?: unknown; replyEnc?: unknown; switched?: unknown;
};
type TaskIn = { id?: unknown; ord?: unknown; bodyEnc?: unknown; minutes?: unknown };
type Window = { start: Date; end: Date };

/** A window from a phone, checked (see windowProblem), or why not. */
function windowOf(s: unknown, e: unknown): Window | string {
  if (typeof s !== 'string' || typeof e !== 'string') return 'Pick a day and a time.';
  const w = { start: new Date(s), end: new Date(e) };
  return windowProblem(w.start, w.end, new Date()) ?? w;
}

/** Tasks from a phone; a sent scene may have none (a roleplay). */
function taskList(v: unknown, mayBeEmpty = false): TaskIn[] | null {
  const tasks = Array.isArray(v) ? (v as TaskIn[]) : null;
  if (!tasks || (!tasks.length && !mayBeEmpty) || tasks.length > 150) return null;
  const ok = tasks.every((t) => isUuid(t.id) && Number.isInteger(t.ord) && isCipher(t.bodyEnc, 'j1', 50_000)
    && (t.minutes == null || (Number.isInteger(t.minutes) && (t.minutes as number) >= 1 && (t.minutes as number) <= 1440)));
  return ok ? tasks : null;
}

// Moving a scene along. The follow drafts and proposes and the lead starts
// it now; or either of you offers a window of time (and says who leads: a
// switched scene swaps the usual roles), the other accepts, asks for a
// change (another window, or how much they can take on) or declines, the
// lead builds it to fit and sends it, and it's started in its window. Then
// inspection (or straight to aftercare), and it closes once everyone is
// back to "us". Tasks are made on the phone (encrypted) and arrive with
// "start" or "send". Windows in a pod never overlap. Roles here are roles
// in the scene.
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
  const offerer = scene.offered_by === me.id;
  const next = sceneTransition(scene.status, action, role, offerer);
  if (!next) return bad('That can’t be done now.', 409);
  const name = await nameOf(me.id);
  const url = `/scene/${id}`;
  const tell = async (body: string, onlyRole?: 'lead' | 'follow') =>
    notifySoon(await others(scene, me.id, onlyRole), { title: 'S-O-M', body, url, tag: `scene-${id}` });
  // Answers go to whoever made the offer.
  const tellOfferer = (body: string) => notifySoon(scene.offered_by ? [scene.offered_by] : [], { title: 'S-O-M', body, url, tag: `scene-${id}` });
  if (b?.planEnc != null && !isCipher(b.planEnc, 'j1', 200_000)) return bad('That doesn’t look like a plan.');
  const planEnc = (b?.planEnc as string | undefined) ?? null;
  if (b?.replyEnc != null && !isCipher(b.replyEnc, 'j1', 8_000)) return bad('That doesn’t look like an answer.');
  const replyEnc = (b?.replyEnc as string | undefined) ?? null;
  const every = typeof b?.checkinMinutes === 'number' && CHECKIN_CHOICES.includes(b.checkinMinutes) ? b.checkinMinutes : null;

  // Changes only if nobody else moved the scene first.
  const move = async (fields?: ReturnType<typeof sql>) => {
    const [s] = fields
      ? await sql`UPDATE som.scenes SET status = ${next}, updated_at = now(), ${fields} WHERE id = ${id} AND status = ${scene.status} RETURNING 1`
      : await sql`UPDATE som.scenes SET status = ${next}, updated_at = now() WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
    return Boolean(s);
  };
  const raced = () => bad('Someone else just changed this scene.', 409);

  // Takes a window for this scene, unless another planned scene in the pod
  // already has some of that time. One lock per pod, so two offers can't
  // both take it.
  const takeWindow = (w: Window, more: (tx: typeof sql) => ReturnType<typeof sql>) => sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`som-window:${scene.pod_id}`}, 0))`;
    const [hit] = await tx`SELECT 1 FROM som.scenes WHERE pod_id = ${scene.pod_id} AND id <> ${id}
                             AND status IN ('offered', 'accepted', 'ready', 'active')
                             AND starts_at < ${w.end} AND ends_at > ${w.start} LIMIT 1`;
    if (hit) return 'clash' as const;
    const [s] = await tx`UPDATE som.scenes SET status = ${next}, updated_at = now(), starts_at = ${w.start}, ends_at = ${w.end}, ${more(tx as unknown as typeof sql)}
                          WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
    return s ? ('ok' as const) : ('raced' as const);
  });
  const clashed = () => bad('That time overlaps another scene you’ve planned.', 409);
  const passed = scene.ends_at !== null && scene.ends_at.getTime() <= Date.now();

  switch (action) {
    case 'offer': {
      const w = windowOf(b?.startsAt, b?.endsAt);
      if (typeof w === 'string') return bad(w);
      if (b?.switched != null && typeof b.switched !== 'boolean') return bad('Say who leads.');
      const switched = typeof b?.switched === 'boolean' ? b.switched : scene.switched;
      // A new offer wants a new answer. Asking for a scene you'll follow in is a request.
      const r = await takeWindow(w, (tx) => tx`change_request = NULL, reply_enc = NULL, offered_by = ${me.id}, switched = ${switched},
                                               plan_enc = coalesce(${planEnc}, plan_enc), plan_rev = plan_rev + ${planEnc ? 1 : 0}`);
      if (r !== 'ok') return r === 'clash' ? clashed() : raced();
      const asking = sceneRole(sceneRole(role, scene.switched), switched) === 'follow';
      await tell(asking ? `${name} asked you for a scene.` : `${name} offered you a scene.`);
      return json({ status: next });
    }
    case 'accept': {
      if (passed) return bad('This offer’s time has passed.', 409);
      if (!(await move(sql`change_request = NULL, reply_enc = coalesce(${replyEnc}, reply_enc)`))) return raced();
      tellOfferer(`${name} accepted.`);
      return json({ status: next });
    }
    case 'accept_send': {
      // The lead accepts a scene that needs no building (a roleplay): it's sent as they accept.
      if (passed) return bad('This offer’s time has passed.', 409);
      const tasks = taskList(b?.tasks ?? [], true);
      if (!tasks) return bad('That doesn’t look like a task list.');
      const ok = await sql.begin(async (tx) => {
        const [s] = await tx`UPDATE som.scenes SET status = 'ready', updated_at = now(), change_request = NULL, checkin_minutes = ${every}
                              WHERE id = ${id} AND status = ${scene.status} RETURNING 1`;
        if (!s) return false;
        for (const t of tasks) {
          await tx`INSERT INTO som.tasks (id, scene_id, ord, body_enc, minutes) VALUES (${t.id as string}, ${id}, ${t.ord as number}, ${t.bodyEnc as string}, ${(t.minutes as number) ?? null})`;
        }
        return true;
      });
      if (!ok) return raced();
      if (scene.starts_at && scene.starts_at.getTime() > Date.now()) await scheduleSceneStart(id, scene.starts_at);
      tellOfferer(`${name} accepted. It’s on.`);
      return json({ status: next });
    }
    case 'decline': {
      if (!(await move(sql`change_request = NULL, reply_enc = NULL`))) return raced();
      tellOfferer(`${name} can’t this time.`);
      return json({ status: next });
    }
    case 'request_change': {
      // Another window, or the same one with a different capacity (in replyEnc).
      if (passed) return bad('This offer’s time has passed.', 409);
      const w = b?.startsAt == null && b?.endsAt == null ? null : windowOf(b?.startsAt, b?.endsAt);
      if (typeof w === 'string') return bad(w);
      if (!w && !replyEnc) return bad('Say what you’d like changed.');
      const request = { by: me.id, startsAt: w?.start.toISOString() ?? null, endsAt: w?.end.toISOString() ?? null };
      if (!(await move(sql`change_request = ${sql.json(request)}, reply_enc = coalesce(${replyEnc}, reply_enc)`))) return raced();
      tellOfferer(`${name} asked for a change.`);
      return json({ status: next });
    }
    case 'agree_change': {
      const cr = scene.change_request;
      if (!cr) return bad('There’s no change to agree to.', 409);
      const w = cr.startsAt && cr.endsAt ? windowOf(cr.startsAt, cr.endsAt)
        : scene.starts_at && scene.ends_at ? { start: scene.starts_at, end: scene.ends_at } : 'There’s no time to agree to.';
      if (typeof w === 'string') return bad(w, 409);
      const r = await takeWindow(w, (tx) => tx`change_request = NULL`);
      if (r !== 'ok') return r === 'clash' ? clashed() : raced();
      await tell(`${name} agreed to your change.`);
      return json({ status: next });
    }
    case 'cancel': {
      if (!(await move(sql`change_request = NULL`))) return raced();
      await cancelTimers(id);
      await tell(`${name} took back the offer.`);
      return json({ status: next });
    }
    case 'send': {
      if (passed) return bad('This scene’s time has passed; offer a new one.', 409);
      const tasks = taskList(b?.tasks, true);
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
        // Sent earlier: the tasks are already there. It starts in its window.
        const when = startState(scene.starts_at, scene.ends_at, new Date());
        if (when === 'early') return bad('It’s too early: it can start half an hour before its time.', 409);
        if (when === 'over') return bad('This scene’s time has passed. Ask for a new time.', 409);
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
      // The vote is added in the database, so two at the same moment both count.
      const [row] = await sql<{ close_votes: string[] }[]>`
        UPDATE som.scenes SET close_votes = array_append(array_remove(close_votes, ${me.id}::uuid), ${me.id}::uuid), updated_at = now()
         WHERE id = ${id} AND status = 'aftercare' RETURNING close_votes`;
      if (!row) return raced();
      const members = (await podMembers(scene.pod_id)).map((m) => m.account_id);
      if (!allAgreed(row.close_votes, members)) {
        await tell(`${name} is back to “us”.`);
        return json({ status: scene.status, votes: row.close_votes });
      }
      const [closed] = await sql`UPDATE som.scenes SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = ${id} AND status = 'aftercare' RETURNING 1`;
      if (closed) {
        await cancelTimers(id);
        await tell('The scene is closed. Back to us.');
      }
      return json({ status: 'closed', votes: row.close_votes });
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
