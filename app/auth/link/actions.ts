'use server';

import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { canUsePassword, type PlatformRole } from '@/lib/access';
import { consumeLink } from '@/lib/auth/links';
import { createSession } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

export async function continueWithLink(form: FormData): Promise<void> {
  const userId = await consumeLink(String(form.get('token') ?? ''));
  if (!userId) redirect('/auth/link?expired=1');
  await createSession(userId);
  await audit(userId, 'login.link');
  const [u] = await sql<{ platform_role: PlatformRole; has_password: boolean }[]>`
    SELECT platform_role, password_hash IS NOT NULL AS has_password FROM core.users WHERE id = ${userId}`;
  // Anyone without a password is nudged to set one the first time in.
  redirect(u && canUsePassword(u.platform_role) && !u.has_password ? '/account?welcome=1' : '/');
}
