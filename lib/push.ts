import 'server-only';
import { Agent } from 'node:https';
import webpush from 'web-push';
import { sql } from './db';
import { reviewMessage } from './push-rules';

// Notifications to people's phones (web push from the installed web app).
// The server makes its own keys on first use and keeps them in
// core.settings, so there's nothing to configure; VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY in the environment override them.

interface Keys { publicKey: string; privateKey: string }
let keys: Promise<Keys> | null = null;

// Tests point subscriptions at a local stand-in push service with a
// throwaway certificate; real push services are always properly signed.
const testAgent = process.env.PUSH_ALLOW_ANY_ENDPOINT === '1' ? new Agent({ rejectUnauthorized: false }) : undefined;

export function vapidKeys(): Promise<Keys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return Promise.resolve({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  }
  keys ??= (async () => {
    const fresh = webpush.generateVAPIDKeys();
    // Two servers starting at once both try; the first one wins and both read it back.
    await sql`INSERT INTO core.settings (key, value) VALUES ('vapid', ${JSON.stringify(fresh)}) ON CONFLICT (key) DO NOTHING`;
    const [row] = await sql<{ value: string }[]>`SELECT value FROM core.settings WHERE key = 'vapid'`;
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
  /** Opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag?: string;
}

/** Sends to every phone the given people turned notifications on for. Returns how many got it. */
export async function notifyUsers(userIds: string[], msg: PushMessage): Promise<number> {
  if (!userIds.length) return 0;
  const subs = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    SELECT id, endpoint, p256dh, auth FROM core.push_subscriptions WHERE user_id = ANY(${userIds}::uuid[])`;
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
          urgency: 'normal',
          timeout: 10_000,
          ...(testAgent ? { agent: testAgent } : {}),
        });
        sent++;
        await sql`UPDATE core.push_subscriptions SET last_sent_at = now() WHERE id = ${s.id}`;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The phone uninstalled the app or turned notifications off.
        if (status === 404 || status === 410) await sql`DELETE FROM core.push_subscriptions WHERE id = ${s.id}`;
        else console.error('[push]', status ?? '', (err as Error).message);
      }
    }),
  );
  return sent;
}

// Review alerts are batched per event: the first upload starts a short
// timer, and one notification then says how many are waiting in total. A
// busy wedding buzzes the hosts' phones every couple of minutes at most.
const REVIEW_DELAY = Number(process.env.PUSH_REVIEW_DELAY_MS) || 90_000;
const pendingTimers = new Map<string, NodeJS.Timeout>();

export function queueReviewNotice(eventId: string): void {
  if (pendingTimers.has(eventId)) return;
  const t = setTimeout(() => {
    pendingTimers.delete(eventId);
    void sendReviewNotice(eventId).catch((err) => console.error('[push] review notice', (err as Error).message));
  }, REVIEW_DELAY);
  t.unref?.();
  pendingTimers.set(eventId, t);
}

async function sendReviewNotice(eventId: string): Promise<void> {
  const [s] = await sql<{ title: string; pending: number; reviewers: string[] }[]>`SELECT * FROM events.review_summary(${eventId})`;
  if (!s || s.pending === 0) return;
  await notifyUsers(s.reviewers, { ...reviewMessage(s.title, s.pending), url: `/events/${eventId}/photos`, tag: `review-${eventId}` });
}
