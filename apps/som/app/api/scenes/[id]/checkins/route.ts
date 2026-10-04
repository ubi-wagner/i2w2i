import { bad, body, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { sceneFor } from '@/lib/server/pods';
import { scheduleCheckin } from '@/lib/server/scheduler';
import { CHECKIN_CHOICES } from '@/lib/plan';

export const dynamic = 'force-dynamic';

/** The lead changes (or stops) check-ins while the scene runs. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  if (found.role !== 'lead' || found.scene.status !== 'active') return bad('That can’t be done now.', 409);
  const b = await body<{ minutes?: unknown }>(req);
  const minutes = b?.minutes === null ? null : typeof b?.minutes === 'number' && CHECKIN_CHOICES.includes(b.minutes) ? b.minutes : undefined;
  if (minutes === undefined) return bad('Pick how often.');
  if (!found.scene.paused_at) await scheduleCheckin(id, minutes);
  else await sql`UPDATE som.scenes SET checkin_minutes = ${minutes} WHERE id = ${id}`;
  return json({ minutes });
}
