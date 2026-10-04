import 'server-only';

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const bad = (error: string, status = 400) => json({ error }, status);

/** Same-origin check for state-changing requests (cookies are SameSite=Lax; this is belt and braces). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

/** Ciphertext from lib/crypto.ts: a short tag and base64url parts, capped in size. */
export function isCipher(v: unknown, tag: 'j1' | 'k1', max = 400_000): v is string {
  return typeof v === 'string' && v.length <= max && new RegExp(`^${tag}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$`).test(v);
}

export function isWrapped(v: unknown, passphrase = false): boolean {
  if (!v || typeof v !== 'object') return false;
  const w = v as Record<string, unknown>;
  const b = (x: unknown, max = 200) => typeof x === 'string' && x.length <= max && /^[A-Za-z0-9_-]+$/.test(x);
  if (w.v !== 1 || !b(w.iv) || !b(w.ct)) return false;
  if (!passphrase) return Object.keys(w).length === 3;
  return b(w.salt) && Number.isInteger(w.iterations) && (w.iterations as number) >= 100_000 && (w.iterations as number) <= 10_000_000 && Object.keys(w).length === 5;
}

import { currentAccount, type Account } from './auth';

/** The signed-in account for an API call (and an origin check for changes), or the response to send. */
export async function guard(req: Request): Promise<Account | Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return bad('Bad origin', 403);
  return (await currentAccount()) ?? bad('Sign in first', 401);
}
