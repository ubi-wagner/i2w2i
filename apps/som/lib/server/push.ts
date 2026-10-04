import 'server-only';
import { Agent } from 'node:https';
import webpush from 'web-push';
import { sql } from './db';

// Phone notifications (web push from the installed app). Messages never say
// what's in a scene, only that something happened and who did it. Keys are
// made on first use and kept in som.settings; VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY in the environment override them.

interface Keys { publicKey: string; privateKey: string }
let keys: Promise<Keys> | null = null;

// Tests use a local stand-in push service with a throwaway certificate.
const testAgent = process.env.PUSH_ALLOW_ANY_ENDPOINT === '1' ? new Agent({ rejectUnauthorized: false }) : undefined;

export function vapidKeys(): Promise<Keys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return Promise.resolve({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  }
  keys ??= (async () => {
    const fresh = webpush.generateVAPIDKeys();
    await sql`INSERT INTO som.settings (key, value) VALUES ('vapid', ${JSON.stringify(fresh)}) ON CONFLICT (key) DO NOTHING`;
    const [row] = await sql<{ value: string }[]>`SELECT value FROM som.settings WHERE key = 'vapid'`;
    return JSON.parse(row!.value) as Keys;
  })().catch((err) => {
    keys = null;
    throw err;
  });
  return keys;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

/** Sends to every phone these accounts turned notifications on for. Returns how many got it. */
export async function notify(accountIds: string[], msg: PushMessage): Promise<number> {
  if (!accountIds.length) return 0;
  const subs = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    SELECT id, endpoint, p256dh, auth FROM som.push_subscriptions WHERE account_id = ANY(${accountIds}::uuid[])`;
  if (!subs.length) return 0;
  const { publicKey, privateKey } = await vapidKeys();
  const payload = JSON.stringify(msg);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject: 'mailto:notifications@i2w2i.com', publicKey, privateKey },
          TTL: 6 * 3600,
          urgency: 'high',
          timeout: 10_000,
          ...(testAgent ? { agent: testAgent } : {}),
        });
        sent++;
        await sql`UPDATE som.push_subscriptions SET last_sent_at = now() WHERE id = ${s.id}`;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await sql`DELETE FROM som.push_subscriptions WHERE id = ${s.id}`;
        else console.error('[push]', status ?? '', (err as Error).message);
      }
    }),
  );
  return sent;
}

/** Fire and forget: a failed notification must never fail the action that caused it. */
export function notifySoon(accountIds: string[], msg: PushMessage): void {
  void notify(accountIds, msg).catch((err) => console.error('[push]', (err as Error).message));
}
