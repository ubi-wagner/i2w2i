import { audit, createSession, verifyPassword } from '@/lib/server/auth';
import { bad, body, json, sameOrigin } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { recordFailure, tooManyFailures } from '@/lib/server/rate-limit';
import { normalizeUsername } from '@/lib/usernames';

export const dynamic = 'force-dynamic';
const WINDOW = 15 * 60_000;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad('Bad origin', 403);
  const b = await body<{ username?: unknown; password?: unknown }>(req);
  const typed = typeof b?.username === 'string' ? b.username.trim().slice(0, 64) : '';
  const password = typeof b?.password === 'string' ? b.password : '';
  if (!typed || !password) return bad('Enter your username and password.');
  const username = normalizeUsername(typed);
  const [a] = username ? await sql<{ id: string; password_hash: string | null }[]>`
    SELECT id, password_hash FROM som.accounts WHERE username = ${username} AND is_active` : [];
  // Failures count per account and per network.
  const key = `pw:${a?.id ?? typed.toLowerCase()}`;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (tooManyFailures(key, 8, WINDOW) || tooManyFailures(`pw-ip:${ip}`, 30, WINDOW)) return bad('Too many attempts. Wait a few minutes and try again.', 429);
  if (!a || !(await verifyPassword(password, a.password_hash))) {
    recordFailure(key, WINDOW);
    recordFailure(`pw-ip:${ip}`, WINDOW);
    await audit(a?.id ?? null, 'login.failed');
    return bad('That username and password don’t match.', 401);
  }
  await createSession(a.id);
  await audit(a.id, 'login');
  return json({ ok: true });
}
