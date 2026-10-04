import { bad, body, guard, isUuid, json } from '@/lib/server/api';
import { nameOf, others, sceneFor } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
import { scheduleArrival } from '@/lib/server/scheduler';

export const dynamic = 'force-dynamic';
const CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120];

/** "I'm on my way": the follow gets a countdown and the arrival routine. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  if (found.role !== 'lead' || !['active', 'inspection'].includes(found.scene.status)) return bad('That can’t be done now.', 409);
  const b = await body<{ minutes?: unknown }>(req);
  const minutes = typeof b?.minutes === 'number' && CHOICES.includes(b.minutes) ? b.minutes : null;
  if (!minutes) return bad('Pick how long.');
  const at = await scheduleArrival(id, minutes);
  notifySoon(await others(found.scene.pod_id, me.id), { title: 'S-O-M', body: `${await nameOf(me.id)} is on the way: about ${minutes} minutes.`, url: `/scene/${id}#arrival`, tag: `arrival-${id}` });
  return json({ arrivalAt: at });
}
