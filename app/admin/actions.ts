'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { type AppRole, type PlatformRole } from '@/lib/access';
import { requireAdmin, revokeAllSessions } from '@/lib/auth/session';
import { createAccount, resetPassword, type Credentials } from '@/lib/auth/accounts';
import { appUrl } from '@/lib/auth/links';
import { audit } from '@/lib/audit';

export interface InviteState {
  error?: string;
  /** For the admin to pass on (text, or read out). */
  credentials?: Credentials;
  url?: string;
}

const PLATFORM_ROLES: PlatformRole[] = ['admin', 'creator', 'member'];
const APP_ROLES: AppRole[] = ['owner', 'editor', 'viewer'];

export async function invitePerson(_prev: InviteState, form: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const role = String(form.get('platform_role')) as PlatformRole;
  if (!PLATFORM_ROLES.includes(role)) return { error: 'Pick what they can do.' };
  const made = await createAccount({
    name: String(form.get('display_name') ?? ''),
    username: String(form.get('username') ?? ''),
    password: String(form.get('password') ?? ''),
    platformRole: role,
    createdBy: admin.id,
  });
  if ('error' in made) return { error: made.error };
  await audit(admin.id, 'people.invite', made.id, { username: made.credentials.username, role });
  revalidatePath('/admin');
  return { credentials: made.credentials, url: appUrl() };
}

export async function resetPersonPassword(_prev: InviteState, form: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const userId = String(form.get('user_id'));
  const done = await resetPassword(admin, userId);
  if ('error' in done) return { error: done.error };
  await audit(admin.id, 'people.password.reset', userId);
  return { credentials: done, url: appUrl() };
}

export async function setPlatformRole(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(form.get('user_id'));
  const role = String(form.get('platform_role')) as PlatformRole;
  if (userId === admin.id || !PLATFORM_ROLES.includes(role)) return;
  await sql`UPDATE core.users SET platform_role = ${role} WHERE id = ${userId}`;
  await audit(admin.id, 'people.role', userId, { role });
  revalidatePath('/admin');
}

export async function setActive(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(form.get('user_id'));
  const active = form.get('active') === 'true';
  if (userId === admin.id) return;
  await sql`UPDATE core.users SET is_active = ${active} WHERE id = ${userId}`;
  if (!active) await revokeAllSessions(userId);
  await audit(admin.id, active ? 'people.reactivate' : 'people.deactivate', userId);
  revalidatePath('/admin');
}

export async function setAppRole(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(form.get('user_id'));
  const appKey = String(form.get('app_key'));
  const role = String(form.get('role'));
  if (role === 'none') {
    await sql`DELETE FROM core.user_app_roles WHERE user_id = ${userId} AND app_key = ${appKey}`;
  } else if (APP_ROLES.includes(role as AppRole)) {
    await sql`INSERT INTO core.user_app_roles (user_id, app_key, role, granted_by)
              VALUES (${userId}, ${appKey}, ${role}, ${admin.id})
              ON CONFLICT (user_id, app_key) DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, granted_at = now()`;
  } else return;
  await audit(admin.id, 'people.app_role', userId, { app: appKey, role });
  revalidatePath('/admin');
}
