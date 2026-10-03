import { audit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { json, sameOrigin } from '@/lib/events/api';
import { vapidKeys } from '@/lib/push';
import { cleanSubscription } from '@/lib/push-rules';

export const dynamic = 'force-dynamic';

// Phones turn notifications on and off here (signed-in people only).
const allowAny = process.env.PUSH_ALLOW_ANY_ENDPOINT === '1'; // tests only: a local endpoint

export async function GET() {
  if (!(await getCurrentUser())) return json({ error: 'Sign in first' }, 401);
  return json({ publicKey: (await vapidKeys()).publicKey });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Sign in first' }, 401);
  const sub = cleanSubscription(await req.json().catch(() => null), allowAny);
  if (!sub) return json({ error: 'That isn’t a notification subscription this server accepts.' }, 400);
  const ua = req.headers.get('user-agent')?.slice(0, 300) ?? null;
  // A phone moves to whoever signed in on it last.
  await sql`
    INSERT INTO core.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (${user.id}, ${sub.endpoint}, ${sub.p256dh}, ${sub.auth}, ${ua})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                                         user_agent = EXCLUDED.user_agent`;
  await audit(user.id, 'push.subscribe');
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Sign in first' }, 401);
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== 'string') return json({ error: 'Bad request' }, 400);
  await sql`DELETE FROM core.push_subscriptions WHERE user_id = ${user.id} AND endpoint = ${body.endpoint}`;
  await audit(user.id, 'push.unsubscribe');
  return json({ ok: true });
}
