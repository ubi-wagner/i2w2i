import 'server-only';
import { sql } from './db';
import { requestMeta } from './request-meta';

/** Account-side audit record, with the request's IP, device and headers. */
export async function audit(actorId: string | null, action: string, target?: string, detail: Record<string, unknown> = {}) {
  const meta = await requestMeta().catch(() => null);
  await sql`INSERT INTO core.audit_log (actor_id, action, target, detail, ip, user_agent, device_id, request)
            VALUES (${actorId}, ${action}, ${target ?? null}, ${sql.json(detail as never)},
                    ${meta?.ip ?? null}, ${meta?.userAgent ?? null}, ${meta?.deviceId ?? null},
                    ${meta ? sql.json(meta.request as never) : null})`;
}
