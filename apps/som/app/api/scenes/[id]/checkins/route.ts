import { bad, body, guard, isUuid, json } from '@/lib/server/api';
import { sceneFor } from '@/lib/server/pods';
import { scheduleCheckin, setCheckins } from '@/lib/server/scheduler';
import { CHECKIN_CHOICES } from '@/lib/plan';

export const dynamic = 'force-dynamic';

/** The lead changes (or stops) check-ins while the scene runs: every so often, at the end of each block, or none. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  if (found.role !== 'lead' || found.scene.status !== 'active') return bad('That can’t be done now.', 409);
  const b = await body<{ minutes?: unknown; blocks?: unknown }>(req);
  const minutes = b?.minutes === null ? null : typeof b?.minutes === 'number' && CHECKIN_CHOICES.includes(b.minutes) ? b.minutes : undefined;
  if (minutes === undefined) return bad('Pick how often.');
  const blocks = b?.blocks === true && found.scene.checkin_at.length > 0;
  await setCheckins(id, minutes, blocks);
  if (!found.scene.paused_at) await scheduleCheckin(id);
  return json({ minutes, blocks });
}
