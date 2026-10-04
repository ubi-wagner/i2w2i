import 'server-only';
import type { Role, SceneStatus } from '../rules';
import { sql } from './db';

export interface Member { account_id: string; role: Role; display_name: string; username: string; has_key: boolean; invited: boolean }

export async function podMembers(podId: string): Promise<Member[]> {
  return sql<Member[]>`
    SELECT m.account_id, m.role, a.display_name, a.username, (m.key_backup IS NOT NULL) AS has_key, (m.invite IS NOT NULL) AS invited
      FROM som.members m JOIN som.accounts a ON a.id = m.account_id
     WHERE m.pod_id = ${podId} AND a.is_active
     ORDER BY m.role, a.display_name`;
}

/** This account's role in the pod, or null if it isn't a member. */
export async function podRole(accountId: string, podId: string): Promise<Role | null> {
  const [m] = await sql<{ role: Role }[]>`
    SELECT m.role FROM som.members m JOIN som.accounts a ON a.id = m.account_id
     WHERE m.pod_id = ${podId} AND m.account_id = ${accountId} AND a.is_active`;
  return m?.role ?? null;
}

export interface SceneRow {
  id: string;
  pod_id: string;
  created_by: string;
  status: SceneStatus;
  plan_enc: string;
  plan_rev: number;
  checkin_minutes: number | null;
  checkin_grace: number;
  next_checkin_at: Date | null;
  arrival_at: Date | null;
  paused_at: Date | null;
  paused_by: string | null;
  started_at: Date | null;
  closed_at: Date | null;
  close_votes: string[];
  delete_votes: string[];
  created_at: Date;
  updated_at: Date;
}

/** The scene and this account's role in it, or null if they aren't in its pod. */
export async function sceneFor(accountId: string, sceneId: string): Promise<{ scene: SceneRow; role: Role } | null> {
  const [scene] = await sql<SceneRow[]>`SELECT * FROM som.scenes WHERE id = ${sceneId}`;
  if (!scene) return null;
  const role = await podRole(accountId, scene.pod_id);
  return role ? { scene, role } : null;
}

/** Everyone else in the pod (for notifications), optionally only one role. */
export async function others(podId: string, accountId: string, role?: Role): Promise<string[]> {
  return (await podMembers(podId)).filter((m) => m.account_id !== accountId && (!role || m.role === role)).map((m) => m.account_id);
}

export async function nameOf(accountId: string): Promise<string> {
  const [a] = await sql<{ display_name: string }[]>`SELECT display_name FROM som.accounts WHERE id = ${accountId}`;
  return a?.display_name ?? 'Someone';
}
