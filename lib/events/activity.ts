import 'server-only';
import { sql } from '../db';
import { requestMeta } from '../request-meta';

export interface ActivityEntry {
  eventId: string | null;
  action: string;
  userId?: string | null;
  guestId?: string | null;
  uploadId?: string | null;
  actorName?: string | null;
  client?: Record<string, unknown> | null;
  detail?: Record<string, unknown>;
}

/**
 * Appends to events.activity with the request's IP, device id and headers.
 * Never throws: a failed log line must not break an upload or a join.
 */
export async function logActivity(e: ActivityEntry): Promise<void> {
  try {
    const meta = await requestMeta();
    await sql`SELECT events.log_activity(${sql.json({
      event_id: e.eventId,
      action: e.action,
      user_id: e.userId ?? null,
      guest_id: e.guestId ?? null,
      upload_id: e.uploadId ?? null,
      actor_name: e.actorName ?? null,
      device_id: meta.deviceId,
      ip: meta.ip,
      user_agent: meta.userAgent,
      client: e.client ?? null,
      request: meta.request,
      detail: e.detail ?? {},
    } as never)})`;
  } catch (err) {
    console.error('[activity] could not record', e.action, (err as Error).message);
  }
}
