import 'server-only';
import { sql } from './db';

export async function audit(actorId: string | null, action: string, target?: string, detail: Record<string, unknown> = {}) {
  await sql`INSERT INTO core.audit_log (actor_id, action, target, detail)
            VALUES (${actorId}, ${action}, ${target ?? null}, ${sql.json(detail as never)})`;
}
