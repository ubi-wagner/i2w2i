import { getCurrentUser } from '@/lib/auth/session';
import { json, sameOrigin } from '@/lib/events/api';
import { rateLimit } from '@/lib/rate-limit';
import { notifyUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** "Send me a test", so people can see notifications really arrive. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Sign in first' }, 401);
  if (!rateLimit(`push-test:${user.id}`, 5, 10 * 60_000)) return json({ error: 'That’s enough tests for now. Try again in a few minutes.' }, 429);
  const sent = await notifyUsers([user.id], {
    title: 'i2w2i',
    body: 'Notifications are on. You’ll hear from us when photos are waiting for your OK.',
    url: '/',
    tag: 'test',
  });
  return json({ sent });
}
