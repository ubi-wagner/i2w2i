import { bad, body, guard, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { vapidKeys } from '@/lib/server/push';
import { cleanSubscription } from '@/lib/push-rules';

export const dynamic = 'force-dynamic';
const allowAny = process.env.PUSH_ALLOW_ANY_ENDPOINT === '1'; // tests only: a local endpoint

export async function GET(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  return json({ publicKey: (await vapidKeys()).publicKey });
}

export async function POST(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const sub = cleanSubscription(await body(req), allowAny);
  if (!sub) return bad('That isn’t a notification subscription this server accepts.');
  // A phone moves to whoever signed in on it last.
  await sql`INSERT INTO som.push_subscriptions (account_id, endpoint, p256dh, auth)
            VALUES (${me.id}, ${sub.endpoint}, ${sub.p256dh}, ${sub.auth})
            ON CONFLICT (endpoint) DO UPDATE SET account_id = EXCLUDED.account_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`;
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const b = await body<{ endpoint?: unknown }>(req);
  if (typeof b?.endpoint !== 'string') return bad('Bad request');
  await sql`DELETE FROM som.push_subscriptions WHERE account_id = ${me.id} AND endpoint = ${b.endpoint}`;
  return json({ ok: true });
}
