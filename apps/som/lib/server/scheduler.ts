import 'server-only';
import { nextBlockCheckin } from '../blocks';
import { sql } from './db';
import { nameOf, sceneMembers } from './pods';
import { notify } from './push';
import { abortMultipart, deleteObject } from './storage';

// Reminders for a running scene: check-ins, missed check-ins, countdowns and
// arrivals. Kept in som.timers, so a restart never loses one, and claimed
// with SKIP LOCKED, so two servers never send the same one twice.

type Kind = 'checkin_due' | 'checkin_overdue' | 'task_due' | 'arrival_soon' | 'arrival' | 'scene_start';
const TICK_MS = Number(process.env.SOM_TICK_MS) || 15_000;
/** Tests shorten minutes to seconds. */
export const MINUTE_MS = Number(process.env.SOM_MINUTE_MS) || 60_000;

export const inMinutes = (m: number) => new Date(Date.now() + m * MINUTE_MS);

export async function cancelTimers(sceneId: string, kinds?: Kind[], taskId?: string): Promise<void> {
  await sql`UPDATE som.timers SET cancelled_at = now()
             WHERE scene_id = ${sceneId} AND fired_at IS NULL AND cancelled_at IS NULL
               ${kinds ? sql`AND kind = ANY(${kinds})` : sql``}
               ${taskId ? sql`AND task_id = ${taskId}` : sql``}`;
}

async function add(sceneId: string, kind: Kind, at: Date, taskId?: string): Promise<void> {
  await sql`INSERT INTO som.timers (scene_id, kind, task_id, fire_at) VALUES (${sceneId}, ${kind}, ${taskId ?? null}, ${at})`;
}

interface CheckinRow { checkin_minutes: number | null; checkin_blocks: boolean; checkin_at: number[]; checkin_base: Date | null }

/** Just after a check-in, a block-end one due within this many minutes counts as done. */
const BLOCK_GRACE = 15;

function nextAt(s: CheckinRow, checkedIn: boolean, now = new Date()): Date | null {
  if (s.checkin_minutes) return new Date(now.getTime() + s.checkin_minutes * MINUTE_MS);
  if (s.checkin_blocks && s.checkin_base) return nextBlockCheckin(s.checkin_base, s.checkin_at, now, MINUTE_MS, checkedIn ? BLOCK_GRACE : 0);
  return null;
}

/**
 * Replaces any pending check-in with the next one, as the scene says: every
 * so many minutes from now, or at the end of the next block. `checkedIn`:
 * the follow just did, so a block end only minutes away is covered.
 */
export async function scheduleCheckin(sceneId: string, checkedIn = false): Promise<void> {
  await cancelTimers(sceneId, ['checkin_due', 'checkin_overdue']);
  const [s] = await sql<CheckinRow[]>`SELECT checkin_minutes, checkin_blocks, checkin_at, checkin_base FROM som.scenes WHERE id = ${sceneId}`;
  const at = s ? nextAt(s, checkedIn) : null;
  await sql`UPDATE som.scenes SET next_checkin_at = ${at}, updated_at = now() WHERE id = ${sceneId}`;
  if (at) await add(sceneId, 'checkin_due', at);
}

/** How the follow checks in from now on: every `minutes`, at the end of each block, or not at all. */
export async function setCheckins(sceneId: string, minutes: number | null, blocks: boolean): Promise<void> {
  await sql`UPDATE som.scenes SET checkin_minutes = ${minutes}, checkin_blocks = ${!minutes && blocks}, updated_at = now() WHERE id = ${sceneId}`;
}

export async function scheduleTask(sceneId: string, taskId: string, dueAt: Date): Promise<void> {
  await cancelTimers(sceneId, ['task_due'], taskId);
  await add(sceneId, 'task_due', dueAt, taskId);
}

export async function scheduleArrival(sceneId: string, minutes: number): Promise<Date> {
  await cancelTimers(sceneId, ['arrival_soon', 'arrival']);
  const at = inMinutes(minutes);
  await sql`UPDATE som.scenes SET arrival_at = ${at}, updated_at = now() WHERE id = ${sceneId}`;
  if (minutes > 5) await add(sceneId, 'arrival_soon', inMinutes(minutes - 5));
  await add(sceneId, 'arrival', at);
  return at;
}

/** A sent scene's start time: both phones hear when it's due. */
export async function scheduleSceneStart(sceneId: string, at: Date): Promise<void> {
  await cancelTimers(sceneId, ['scene_start']);
  await add(sceneId, 'scene_start', at);
}

/** Pausing stops every reminder; resuming moves countdowns on by the time spent paused. */
export async function pauseTimers(sceneId: string): Promise<void> {
  await cancelTimers(sceneId);
}

export async function resumeTimers(sceneId: string, pausedAt: Date): Promise<void> {
  const shift = Date.now() - pausedAt.getTime();
  // The blocks move on by the time spent paused, like the countdowns.
  await sql`UPDATE som.scenes SET checkin_base = checkin_base + make_interval(secs => ${shift / 1000}) WHERE id = ${sceneId} AND checkin_base IS NOT NULL`;
  const tasks = await sql<{ id: string; due_at: Date }[]>`
    UPDATE som.tasks SET due_at = due_at + make_interval(secs => ${shift / 1000})
     WHERE scene_id = ${sceneId} AND due_at IS NOT NULL AND status = 'started'
    RETURNING id, due_at`;
  for (const t of tasks) await add(sceneId, 'task_due', t.due_at, t.id);
  await scheduleCheckin(sceneId);
}

/** An arrival is real travel: pausing doesn't move it, but its reminder comes back on resume. */
export async function restoreArrival(sceneId: string): Promise<void> {
  const [s] = await sql<{ arrival_at: Date | null }[]>`SELECT arrival_at FROM som.scenes WHERE id = ${sceneId}`;
  if (s?.arrival_at && s.arrival_at.getTime() > Date.now()) await add(sceneId, 'arrival', s.arrival_at);
}

interface Fired { id: string; scene_id: string; kind: Kind; task_id: string | null; fire_at: Date }

async function fire(t: Fired): Promise<void> {
  const [scene] = await sql<(CheckinRow & { pod_id: string; switched: boolean; status: string; paused_at: Date | null; checkin_grace: number })[]>`
    SELECT pod_id, switched, status, paused_at, checkin_grace, checkin_minutes, checkin_blocks, checkin_at, checkin_base FROM som.scenes WHERE id = ${t.scene_id}`;
  if (!scene || scene.paused_at || scene.status === 'closed') return;
  const members = await sceneMembers(scene);
  const leads = members.filter((m) => m.role === 'lead').map((m) => m.account_id);
  const follows = members.filter((m) => m.role === 'follow').map((m) => m.account_id);
  const url = `/scene/${t.scene_id}`;
  const running = scene.status === 'active';

  switch (t.kind) {
    case 'checkin_due':
      if (!running) return;
      // What comes next is set first, so a failed notification can't lose it:
      // the missed-check-in alarm, and the next block end (they come round
      // whether or not this one is answered).
      await add(t.scene_id, 'checkin_overdue', inMinutes(scene.checkin_grace));
      if (!scene.checkin_minutes) {
        const next = nextAt(scene, false, new Date(t.fire_at.getTime() + 1));
        if (next) await add(t.scene_id, 'checkin_due', next);
      }
      await notify(follows, { title: 'S-O-M', body: 'Time to check in.', url: `${url}#checkin`, tag: `checkin-${t.scene_id}` });
      return;
    case 'checkin_overdue': {
      if (!running) return;
      const [since] = await sql`SELECT 1 FROM som.entries WHERE scene_id = ${t.scene_id} AND kind = 'checkin' AND created_at >= ${new Date(t.fire_at.getTime() - scene.checkin_grace * MINUTE_MS)}`;
      if (since) return;
      const who = follows.length === 1 ? await nameOf(follows[0]!) : 'Your partner';
      await notify(leads, { title: 'S-O-M', body: `${who} missed a check-in.`, url, tag: `missed-${t.scene_id}` });
      return;
    }
    case 'task_due':
      if (!running) return;
      await notify(follows, { title: 'S-O-M', body: 'Time’s up on a task.', url: t.task_id ? `${url}#task-${t.task_id}` : url, tag: `task-${t.task_id}` });
      return;
    case 'scene_start': {
      if (scene.status !== 'ready') return;
      const who = follows.length === 1 ? await nameOf(follows[0]!) : 'Your partner';
      await notify(follows, { title: 'S-O-M', body: 'Your scene starts now. Open it and tap Start.', url, tag: `scene-${t.scene_id}` });
      await notify(leads, { title: 'S-O-M', body: `${who}’s scene is due to start.`, url, tag: `scene-${t.scene_id}` });
      return;
    }
    case 'arrival_soon':
    case 'arrival': {
      const who = leads.length === 1 ? await nameOf(leads[0]!) : 'They';
      const body = t.kind === 'arrival' ? `${who} is arriving now.` : `${who} arrives in about 5 minutes.`;
      await notify(follows, { title: 'S-O-M', body, url: `${url}#arrival`, tag: `arrival-${t.scene_id}` });
      return;
    }
  }
}

export async function tick(): Promise<number> {
  const due = await sql<Fired[]>`
    UPDATE som.timers SET fired_at = now()
     WHERE id IN (SELECT id FROM som.timers
                   WHERE fired_at IS NULL AND cancelled_at IS NULL AND fire_at <= now()
                   ORDER BY fire_at LIMIT 50 FOR UPDATE SKIP LOCKED)
    RETURNING id, scene_id, kind, task_id, fire_at`;
  for (const t of due) await fire(t).catch((err) => console.error('[timers]', t.kind, (err as Error).message));
  return due.length;
}

/**
 * Uploads that never finished (the app was closed mid-send, a phone lost
 * its connection for good): after a day, their half-sent parts and rows go.
 */
export async function sweepUploads(): Promise<number> {
  const stale = await sql<{ id: string; object_key: string; thumb_key: string | null; upload_id: string | null }[]>`
    SELECT id, object_key, thumb_key, upload_id FROM som.media
     WHERE status = 'uploading' AND created_at < now() - interval '24 hours' ORDER BY created_at LIMIT 50`;
  for (const m of stale) {
    if (m.upload_id) await abortMultipart(m.object_key, m.upload_id).catch(() => {});
    await deleteObject(m.object_key).catch(() => {});
    if (m.thumb_key) await deleteObject(m.thumb_key).catch(() => {});
    await sql`DELETE FROM som.media WHERE id = ${m.id} AND status = 'uploading'`;
  }
  return stale.length;
}

let started = false;
export function startScheduler(): void {
  if (started) return;
  started = true;
  const loop = setInterval(() => void tick().catch((err) => console.error('[timers]', (err as Error).message)), TICK_MS);
  loop.unref?.();
  const sweep = setInterval(() => void sweepUploads().catch((err) => console.error('[uploads]', (err as Error).message)), 60 * 60_000);
  sweep.unref?.();
}
