// Who may do what, as pure functions (used by the API and the screens).
// The lead chooses, starts, reviews and scores; the follow drafts, carries
// out and sends proof. Either can pause at any time.
//
// Two ways into a scene:
//   the follow drafts it → proposes → the lead starts it now;
//   the lead offers a day (when, how long) → the follow accepts or asks for
//   a change → the lead builds it and sends it → the follow starts it.

export type Role = 'lead' | 'follow';
export type SceneStatus = 'draft' | 'offered' | 'accepted' | 'proposed' | 'ready' | 'active' | 'inspection' | 'aftercare' | 'closed';
export type TaskStatus = 'todo' | 'started' | 'submitted' | 'returned' | 'approved' | 'skipped';
export type SceneAction =
  | 'edit' | 'propose' | 'withdraw' | 'start' | 'inspect' | 'aftercare' | 'close'
  | 'offer' | 'accept' | 'request_change' | 'agree_change' | 'cancel' | 'send' | 'unsend';
export type TaskAction = 'start' | 'submit' | 'approve' | 'return' | 'skip' | 'reopen';

export const SCENE_STATUSES: SceneStatus[] = ['draft', 'offered', 'accepted', 'proposed', 'ready', 'active', 'inspection', 'aftercare', 'closed'];

/** Statuses before anything runs (nothing to pause, no tasks yet except when ready). */
export const BEFORE_START: SceneStatus[] = ['draft', 'offered', 'accepted', 'proposed', 'ready'];

/** The scene's next status for an action by this role, or null if it isn't allowed. */
export function sceneTransition(status: SceneStatus, action: SceneAction, role: Role): SceneStatus | null {
  const lead = role === 'lead';
  switch (action) {
    case 'edit':
      return status === 'draft' || (lead && (status === 'proposed' || status === 'accepted')) ? status : null;
    case 'propose':
      return status === 'draft' && !lead ? 'proposed' : null;
    case 'withdraw':
      return status === 'proposed' && !lead ? 'draft' : null;
    case 'offer': // a new offer, or a different time or length
      return lead && (status === 'draft' || status === 'offered' || status === 'accepted') ? 'offered' : null;
    case 'accept':
    case 'agree_change':
      return status === 'offered' && (action === 'accept' ? !lead : lead) ? 'accepted' : null;
    case 'request_change':
      return status === 'offered' && !lead ? 'offered' : null;
    case 'cancel':
      return lead && (status === 'offered' || status === 'accepted') ? 'draft' : null;
    case 'send':
      return lead && status === 'accepted' ? 'ready' : null;
    case 'unsend':
      return lead && status === 'ready' ? 'accepted' : null;
    case 'start':
      // The lead starts a draft or proposal now; a sent scene is started by either.
      return ((status === 'draft' || status === 'proposed') && lead) || status === 'ready' ? 'active' : null;
    case 'inspect':
      return status === 'active' && lead ? 'inspection' : null;
    case 'aftercare':
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
