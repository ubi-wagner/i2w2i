'use server';

import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { canUsePassword, type PlatformRole } from '@/lib/access';
import { consumeLink } from '@/lib/auth/links';
import { createSession } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

export async function continueWithLink(form: FormData): Promise<void> {
  const link = await consumeLink(String(form.get('token') ?? ''));
  if (!link) redirect('/auth/link?expired=1');
  const { userId, purpose } = link;
  await createSession(userId, 'link');
  await audit(userId, 'login.link', undefined, { purpose });
  const [u] = await sql<{ platform_role: PlatformRole; has_password: boolean }[]>`
    SELECT platform_role, password_hash IS NOT NULL AS has_password FROM core.users WHERE id = ${userId}`;
  // No password yet: choose one. A handed-out link for someone who has one is
  // how passwords are reset without email: go straight to choosing a new one.
  if (u && canUsePassword(u.platform_role) && !u.has_password) redirect('/account?welcome=1');
  redirect(purpose === 'invite' ? '/account?reset=1' : '/');
}
