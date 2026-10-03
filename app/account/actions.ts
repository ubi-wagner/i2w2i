'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { canUsePassword } from '@/lib/access';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { createSession, endSession, requireUser, revokeAllSessions } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { withCtx } from '@/lib/events/db';
import { userCtx } from '@/lib/events/session';

export interface FormState {
  error?: string;
  message?: string;
  /** After a first password or a reset: where to go next. */
  continueTo?: string;
}

export async function setPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canUsePassword(user.platform_role)) return { error: 'Your account signs in by email link.' };
  const current = String(form.get('current') ?? '');
  const next = String(form.get('password') ?? '');
  if (next !== String(form.get('confirm') ?? '')) return { error: 'The two passwords don’t match.' };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  const [row] = await sql<{ password_hash: string | null }[]>`SELECT password_hash FROM core.users WHERE id = ${user.id}`;
  // Just signed in with a handed-out link (forgot password): no old password needed.
  if (row?.password_hash && !user.fresh_link && !(await verifyPassword(current, row.password_hash))) {
    return { error: 'Your current password isn’t right.' };
  }
  await sql`UPDATE core.users SET password_hash = ${await hashPassword(next)} WHERE id = ${user.id}`;
  // Changing a password signs out every other device.
  await revokeAllSessions(user.id);
  await createSession(user.id);
  await audit(user.id, 'account.password.set');
  revalidatePath('/account');
  // First password or a reset: send them on, straight to the album if there's only one.
  if (!row?.password_hash || user.fresh_link) {
    const slugs = await withCtx(userCtx(user), (tx) => tx<{ slug: string }[]>`SELECT slug FROM events.events e WHERE events.is_member(e.id) LIMIT 2`);
    return { message: 'Password saved.', continueTo: slugs.length === 1 ? `/album/${slugs[0].slug}` : '/' };
  }
  return { message: 'Password saved.' };
}

export async function updateName(form: FormData): Promise<void> {
  const user = await requireUser();
  const name = String(form.get('display_name') ?? '').trim().slice(0, 80);
  if (name) await sql`UPDATE core.users SET display_name = ${name} WHERE id = ${user.id}`;
  revalidatePath('/account');
}

export async function signOutEverywhere(): Promise<void> {
  const user = await requireUser();
  await revokeAllSessions(user.id);
  await endSession();
  await audit(user.id, 'account.sessions.revoked');
  redirect('/login');
}
