import { guard, json } from '@/lib/server/api';
import { notify } from '@/lib/server/push';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  if (!rateLimit(`push-test:${me.id}`, 5, 10 * 60_000)) return json({ error: 'That’s enough tests for now.' }, 429);
  const sent = await notify([me.id], { title: 'S-O-M', body: 'Notifications are working.', url: '/', tag: 'test' });
  return json({ sent });
}
