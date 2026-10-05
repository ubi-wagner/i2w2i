// Who may do what, as pure functions (used by the API and the screens).
// The lead chooses, starts, reviews and scores; the follow drafts, carries
// out and sends proof. Either can pause at any time.
//
// Two ways into a scene:
//   the follow drafts it → proposes → the lead starts it now;
//   either of you offers (or asks for) a window of time (a day, from, until)
//   → the other accepts, asks for a change (schedule or capacity) or says
//   not this time → the lead builds it to fit and sends it (a roleplay the
//   lead accepts is sent as they accept) → it's started in its window.
//
// A scene can be switched: the one who usually follows leads it. Roles here
// are the roles in the scene (see sceneRole).

export type Role = 'lead' | 'follow';
export type SceneStatus = 'draft' | 'offered' | 'accepted' | 'proposed' | 'ready' | 'active' | 'inspection' | 'aftercare' | 'closed';
export type TaskStatus = 'todo' | 'started' | 'submitted' | 'returned' | 'approved' | 'skipped';
export type SceneAction =
  | 'edit' | 'propose' | 'withdraw' | 'start' | 'inspect' | 'aftercare' | 'close'
  | 'offer' | 'accept' | 'accept_send' | 'request_change' | 'decline' | 'agree_change' | 'cancel' | 'send' | 'unsend';
export type TaskAction = 'start' | 'submit' | 'approve' | 'return' | 'skip' | 'reopen';

export const SCENE_STATUSES: SceneStatus[] = ['draft', 'offered', 'accepted', 'proposed', 'ready', 'active', 'inspection', 'aftercare', 'closed'];

/** Statuses before anything runs (nothing to pause, no tasks yet except when ready). */
export const BEFORE_START: SceneStatus[] = ['draft', 'offered', 'accepted', 'proposed', 'ready'];

/** Someone's role in a scene: their role in the pod, the other way round if it's switched. */
export function sceneRole(podRole: Role, switched: boolean): Role {
  return switched ? (podRole === 'lead' ? 'follow' : 'lead') : podRole;
}

/**
 * The scene's next status for an action by this role (in the scene), or
 * null if it isn't allowed. `offerer`: whether they made the offer on the
 * table (the other one answers it).
 */
export function sceneTransition(status: SceneStatus, action: SceneAction, role: Role, offerer = false): SceneStatus | null {
  const lead = role === 'lead';
  switch (action) {
    case 'edit':
      return status === 'draft' || (lead && (status === 'proposed' || status === 'accepted')) ? status : null;
    case 'propose':
      return status === 'draft' && !lead ? 'proposed' : null;
    case 'withdraw': // the follow takes a proposal back, or the lead says "not now"
      return status === 'proposed' ? 'draft' : null;
    case 'offer':
      // A new offer by either of you; the offerer's different window; once
      // agreed, a new time from either of you; the lead giving a proposal a time.
      if (status === 'draft' || status === 'accepted' || (status === 'offered' && offerer) || (status === 'proposed' && lead)) return 'offered';
      return null;
    case 'accept':
      return status === 'offered' && !offerer ? 'accepted' : null;
    case 'accept_send': // the lead accepts a scene that needs no building (a roleplay)
      return status === 'offered' && !offerer && lead ? 'ready' : null;
    case 'request_change':
      return status === 'offered' && !offerer ? 'offered' : null;
    case 'decline':
      return status === 'offered' && !offerer ? 'draft' : null;
    case 'agree_change':
      return status === 'offered' && offerer ? 'accepted' : null;
    case 'cancel': // the offerer takes an offer back; once agreed or sent, either of you can call it off
      return (status === 'offered' && offerer) || status === 'accepted' || status === 'ready' ? 'draft' : null;
    case 'send':
      return lead && status === 'accepted' ? 'ready' : null;
    case 'unsend':
      return lead && status === 'ready' ? 'accepted' : null;
    case 'start':
      // The lead starts a draft or proposal now; a sent scene is started by either.
      return ((status === 'draft' || status === 'proposed') && lead) || status === 'ready' ? 'active' : null;
    case 'inspect':
      return status === 'active' && lead ? 'inspection' : null;
    case 'aftercare': // only after the inspection: the scorecard is where rewards are earned
      return status === 'inspection' && lead ? 'aftercare' : null;
    case 'close':
      return status === 'aftercare' ? 'closed' : null;
  }
}

/** A task's next status, or null. Tasks only move while the scene runs and isn't paused. */
export function taskTransition(status: TaskStatus, action: TaskAction, role: Role): TaskStatus | null {
  if (role === 'follow') {
    if (action === 'start' && (status === 'todo' || status === 'returned')) return 'started';
    if (action === 'submit' && (status === 'todo' || status === 'started' || status === 'returned')) return 'submitted';
    return null;
  }
  if (action === 'approve' && status === 'submitted') return 'approved';
  if (action === 'return' && status === 'submitted') return 'returned';
  if (action === 'skip' && (status === 'todo' || status === 'started' || status === 'returned')) return 'skipped';
  if (action === 'reopen' && (status === 'approved' || status === 'skipped')) return 'todo';
  return null;
}

/** Content belongs to whoever made it: only they delete it. */
export function canDelete(authorId: string, accountId: string): boolean {
  return authorId === accountId;
}

/** A whole scene goes only when every member has agreed. */
export function allAgreed(votes: string[], memberIds: string[]): boolean {
  return memberIds.length > 0 && memberIds.every((m) => votes.includes(m));
}

/** Writing in a scene (comments, proof, check-ins) is open until it's closed. */
export function canWrite(status: SceneStatus): boolean {
  return status !== 'closed';
}

// ── Windows ─────────────────────────────────────────────────────────────────
// An offered scene is a window of the lead's time. Windows are 15 minutes
// to 48 hours, end in the future, and don't overlap another planned one.
// It can be started from a little before it opens until it closes.

/** How much the follow can take on that day. */
export type Capacity = 'light' | 'normal' | 'full';
export const CAPACITIES: Capacity[] = ['light', 'normal', 'full'];

const MIN = 60_000;
export const WINDOW_MIN = 15 * MIN;
export const WINDOW_MAX = 48 * 60 * MIN;
/** How early a sent scene can be started. */
export const EARLY_START = 30 * MIN;

/** Why a window can't be offered, or null if it's fine. */
export function windowProblem(start: Date, end: Date, now: Date): string | null {
  const s = start.getTime();
  const e = end.getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 'Pick a day and a time.';
  if (e - s < WINDOW_MIN) return 'Make it at least 15 minutes.';
  if (e - s > WINDOW_MAX) return 'Make it 48 hours or less.';
  if (e <= now.getTime()) return 'That time has already passed.';
  if (s > now.getTime() + 120 * 24 * 60 * MIN) return 'That’s too far ahead.';
  return null;
}

/** True when two windows share any time (touching ends don't count). */
export function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Whether a sent scene can be started now: 'early', 'ok' or 'over'. */
export function startState(start: Date | null, end: Date | null, now: Date): 'early' | 'ok' | 'over' {
  if (!start || !end) return 'ok';
  if (now.getTime() < start.getTime() - EARLY_START) return 'early';
  if (now.getTime() >= end.getTime()) return 'over';
  return 'ok';
}
