'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { canUsePassword, normalizeEmail, normalizeUsername, safeNext, type PlatformRole } from '@/lib/access';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { issueLink } from '@/lib/auth/links';
import { sendEmail } from '@/lib/email';
import { rateLimit, recordFailure, tooManyFailures } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { parseClient } from '@/lib/request-meta';

export interface FormState {
  error?: string;
  message?: string;
  /** Echoed back so the field survives React's post-action form reset. */
  email?: string;
  username?: string;
}

async function clientIp() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

/** Username and password. Accounts made before usernames can also use their email. */
export async function loginWithPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const typed = String(form.get('username') ?? '').trim().slice(0, 254);
  const password = String(form.get('password') ?? '');
  if (!typed || !password) return { error: 'Enter your username and password.', username: typed };
  const email = typed.includes('@') ? normalizeEmail(typed) : null;
  const username = email ? null : normalizeUsername(typed);

  const [user] = email || username
    ? await sql<{ id: string; password_hash: string | null; platform_role: PlatformRole }[]>`
        SELECT id, password_hash, platform_role FROM core.users
         WHERE ${email ? sql`email = ${email}` : sql`username = ${username}`} AND is_active`
    : [];
  // Failures count per account (however it was typed) and per network.
  const key = `pw:${user?.id ?? typed.toLowerCase()}`;
  const ip = await clientIp();
  const WINDOW = 15 * 60_000;
  if (tooManyFailures(key, 8, WINDOW) || tooManyFailures(`pw-ip:${ip}`, 30, WINDOW)) {
    return { error: 'Too many attempts. Wait a few minutes and try again.', username: typed };
  }
  const ok = await verifyPassword(password, user && canUsePassword(user.platform_role) ? user.password_hash : null);
  if (!user || !ok) {
    recordFailure(key, WINDOW);
    recordFailure(`pw-ip:${ip}`, WINDOW);
    await audit(user?.id ?? null, 'login.password.failed', typed, { client: parseClient(form.get('client')) });
    return { error: 'That username and password don’t match.', username: typed };
  }
  await createSession(user.id);
  await audit(user.id, 'login.password', undefined, { client: parseClient(form.get('client')) });
  redirect(safeNext(String(form.get('next') ?? '')));
}

export async function requestLoginLink(_prev: FormState, form: FormData): Promise<FormState> {
  const typed = String(form.get('email') ?? '');
  const email = normalizeEmail(typed);
  if (!email) return { error: 'Enter a valid email address.', email: typed };
  const ip = await clientIp();
  if (!rateLimit(`link:${email}`, 3, 15 * 60_000) || !rateLimit(`link-ip:${ip}`, 20, 15 * 60_000)) {
    return { error: 'Too many requests. Check your inbox, or try again in a few minutes.', email };
  }

  const [user] = await sql<{ id: string; display_name: string }[]>`
    SELECT id, display_name FROM core.users WHERE email = ${email} AND is_active`;
  if (user) {
    const link = await issueLink(user.id, 'login');
    await sendEmail({
      to: email,
      subject: 'Your i2w2i sign-in link',
      text: `Hi ${user.display_name},\n\nTap to sign in (this link works once, for 20 minutes):\n${link}\n\nIf you didn't ask for this, you can ignore it.`,
    });
    await audit(user.id, 'login.link.requested', undefined, { client: parseClient(form.get('client')) });
  }
  // Same answer either way, so this can't be used to discover who has an account.
  return { message: 'If that email is registered, a sign-in link is on its way.', email };
}
