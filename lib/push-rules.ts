// Pure rules for phone notifications (web push). No I/O.

/**
 * The browsers' push services. A subscription names the URL our server will
 * POST to, so only these are accepted; anything else would let a signed-in
 * user make the server call arbitrary addresses.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Android, Edge on Android
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari, iPhone home-screen apps
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
];

export function isPushEndpoint(raw: unknown, allowAny = false): raw is string {
  if (typeof raw !== 'string' || raw.length > 1000) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (allowAny) return u.protocol === 'https:' || u.protocol === 'http:';
  return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((h) => h.test(u.hostname));
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** The browser's subscription object, checked: endpoint plus its two keys. */
export function cleanSubscription(raw: unknown, allowAny = false): { endpoint: string; p256dh: string; auth: string } | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const p256dh = r.keys?.p256dh;
  const auth = r.keys?.auth;
  if (!isPushEndpoint(r.endpoint, allowAny)) return null;
  if (typeof p256dh !== 'string' || p256dh.length < 80 || p256dh.length > 200 || !B64URL.test(p256dh)) return null;
  if (typeof auth !== 'string' || auth.length < 16 || auth.length > 100 || !B64URL.test(auth)) return null;
  return { endpoint: r.endpoint as string, p256dh, auth };
}

/** "3 new photos are waiting for your OK." */
export function reviewMessage(title: string, pending: number): { title: string; body: string } {
  return {
    title,
    body: `${pending} new ${pending === 1 ? 'photo is' : 'photos are'} waiting for your OK.`,
  };
}
