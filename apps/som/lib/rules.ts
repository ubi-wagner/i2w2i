// Who may do what, as pure functions (used by the API and the screens).
// The lead chooses, starts, reviews and scores; the follow drafts, carries
// out and sends proof. Either can pause at any time.

export type Role = 'lead' | 'follow';
export type SceneStatus = 'draft' | 'proposed' | 'active' | 'inspection' | 'aftercare' | 'closed';
export type TaskStatus = 'todo' | 'started' | 'submitted' | 'returned' | 'approved' | 'skipped';
export type SceneAction = 'edit' | 'propose' | 'withdraw' | 'start' | 'inspect' | 'aftercare' | 'close';
export type TaskAction = 'start' | 'submit' | 'approve' | 'return' | 'skip' | 'reopen';

export const SCENE_STATUSES: SceneStatus[] = ['draft', 'proposed', 'active', 'inspection', 'aftercare', 'closed'];

/** The scene's next status for an action by this role, or null if it isn't allowed. */
export function sceneTransition(status: SceneStatus, action: SceneAction, role: Role): SceneStatus | null {
  switch (action) {
    case 'edit':
      return status === 'draft' || (status === 'proposed' && role === 'lead') ? status : null;
    case 'propose':
      return status === 'draft' && role === 'follow' ? 'proposed' : null;
    case 'withdraw':
      return status === 'proposed' && role === 'follow' ? 'draft' : null;
    case 'start':
      return (status === 'draft' || status === 'proposed') && role === 'lead' ? 'active' : null;
    case 'inspect':
      return status === 'active' && role === 'lead' ? 'inspection' : null;
    case 'aftercare':
      return status === 'inspection' && role === 'lead' ? 'aftercare' : null;
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
