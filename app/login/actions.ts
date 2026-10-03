'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { canUsePassword, normalizeEmail, safeNext, type PlatformRole } from '@/lib/access';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { issueLink } from '@/lib/auth/links';
import { sendEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { parseClient } from '@/lib/request-meta';

export interface FormState {
  error?: string;
  message?: string;
  /** Echoed back so the field survives React's post-action form reset. */
  email?: string;
}

async function clientIp() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function loginWithPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const typed = String(form.get('email') ?? '');
  const email = normalizeEmail(typed);
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.', email: typed };
  const ip = await clientIp();
  if (!rateLimit(`pw:${email}`, 8, 15 * 60_000) || !rateLimit(`pw-ip:${ip}`, 30, 15 * 60_000)) {
    return { error: 'Too many attempts. Wait a few minutes and try again.', email };
  }

  const [user] = await sql<{ id: string; password_hash: string | null; platform_role: PlatformRole }[]>`
    SELECT id, password_hash, platform_role FROM core.users WHERE email = ${email} AND is_active`;
  const ok = await verifyPassword(password, user && canUsePassword(user.platform_role) ? user.password_hash : null);
  if (!user || !ok) {
    await audit(user?.id ?? null, 'login.password.failed', email, { client: parseClient(form.get('client')) });
    return { error: 'That email and password don’t match. You can also ask for a sign-in link.', email };
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
