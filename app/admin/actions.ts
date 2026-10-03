'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { normalizeEmail, type AppRole, type PlatformRole } from '@/lib/access';
import { requireAdmin, revokeAllSessions } from '@/lib/auth/session';
import { issueLink } from '@/lib/auth/links';
import { sendEmail } from '@/lib/email';
import { audit } from '@/lib/audit';

export interface InviteState {
  error?: string;
  link?: string;
  emailed?: boolean;
  name?: string;
  /** Echoed back on error so the form keeps what was typed. */
  fields?: { email: string; display_name: string; platform_role: string };
}

const PLATFORM_ROLES: PlatformRole[] = ['admin', 'creator', 'member'];
const APP_ROLES: AppRole[] = ['owner', 'editor', 'viewer'];

async function sendInvite(userId: string, email: string, name: string, inviter: string) {
  const link = await issueLink(userId, 'invite');
  const emailed = await sendEmail({
    to: email,
    subject: `${inviter} invited you to i2w2i`,
    text: `Hi ${name},\n\n${inviter} added you to i2w2i, our family's private site.\n\nTap to get started (this link works once, for 7 days):\n${link}\n`,
  });
  return { link, emailed };
}

export async function invitePerson(_prev: InviteState, form: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const email = normalizeEmail(String(form.get('email') ?? ''));
  const name = String(form.get('display_name') ?? '').trim().slice(0, 80);
  const role = String(form.get('platform_role')) as PlatformRole;
  const fields = { email: String(form.get('email') ?? ''), display_name: name, platform_role: role };
  if (!email) return { error: 'Enter a valid email address.', fields };
  if (!name) return { error: 'Enter their name.', fields };
  if (!PLATFORM_ROLES.includes(role)) return { error: 'Pick a role.', fields };

  const [existing] = await sql`SELECT 1 FROM core.users WHERE email = ${email}`;
  if (existing) return { error: 'Someone with that email is already here. Use “Send link” in the list below.', fields };

  const userId = await sql.begin(async (tx) => {
    const [u] = await tx<{ id: string }[]>`
      INSERT INTO core.users (email, display_name, platform_role, created_by)
      VALUES (${email}, ${name}, ${role}, ${admin.id}) RETURNING id`;
    await tx`INSERT INTO core.family_members (family_id, user_id) SELECT id, ${u!.id} FROM core.families`;
    // Everyone starts with Events; creators can make their own.
    await tx`INSERT INTO core.user_app_roles (user_id, app_key, role, granted_by)
             VALUES (${u!.id}, 'events', ${role === 'member' ? 'viewer' : 'editor'}, ${admin.id})`;
    return u!.id;
  });
  await audit(admin.id, 'people.invite', userId, { email, role });
  const sent = await sendInvite(userId, email, name, admin.display_name);
  revalidatePath('/admin');
  return { ...sent, name };
}

export async function resendInvite(_prev: InviteState, form: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const userId = String(form.get('user_id'));
  const [u] = await sql<{ email: string; display_name: string }[]>`
    SELECT email, display_name FROM core.users WHERE id = ${userId} AND is_active`;
  if (!u) return { error: 'That person is deactivated.' };
  await audit(admin.id, 'people.link.sent', userId);
  return { ...(await sendInvite(userId, u.email, u.display_name, admin.display_name)), name: u.display_name };
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
