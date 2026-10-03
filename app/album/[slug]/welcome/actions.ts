'use server';

import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { audit } from '@/lib/audit';
import { consumeLink, peekLink } from '@/lib/auth/links';
import { hashPassword, passwordProblem } from '@/lib/auth/password';
import { createSession, revokeAllSessions } from '@/lib/auth/session';

export interface WelcomeState {
  error?: string;
  expired?: boolean;
}

/**
 * One step from an event invite (or reset) link to the album: choose a
 * password and you're in. The link is only used up once the password is
 * acceptable, so a typo doesn't burn it.
 */
export async function acceptEventInvite(_prev: WelcomeState, form: FormData): Promise<WelcomeState> {
  const token = String(form.get('token') ?? '');
  const slug = String(form.get('slug') ?? '');
  const password = String(form.get('password') ?? '');
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return { expired: true };
  if (!(await peekLink(token))) return { expired: true };
  if (password !== String(form.get('confirm') ?? '')) return { error: 'The two passwords don’t match. Try typing them again.' };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const link = await consumeLink(token);
  if (!link) return { expired: true };
  await sql`UPDATE core.users SET password_hash = ${await hashPassword(password)} WHERE id = ${link.userId}`;
  // A new password signs out anywhere else (a reset may be for a lost phone).
  await revokeAllSessions(link.userId);
  // They just chose the password, so no 'fresh link' window to change it again without it.
  await createSession(link.userId, 'password');
  await audit(link.userId, 'login.link', undefined, { purpose: link.purpose, via: 'event-welcome', slug });
  await audit(link.userId, 'account.password.set');
  redirect(`/album/${slug}`);
}
