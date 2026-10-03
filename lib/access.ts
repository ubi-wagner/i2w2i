// Pure access rules, shared by pages and actions. No I/O here.

export type PlatformRole = 'admin' | 'creator' | 'member';
export type AppRole = 'owner' | 'editor' | 'viewer';

export interface AppRow {
  key: string;
  name: string;
  description: string;
  path: string;
  sensitive: boolean;
  is_enabled: boolean;
  sort_order: number;
}

export interface Viewer {
  id: string;
  platform_role: PlatformRole;
}

/**
 * Which apps a person sees on their dashboard.
 * - Disabled apps are hidden from everyone.
 * - Sensitive apps need an explicit grant; admin has no override.
 * - Admin sees every other enabled app.
 * - Everyone else needs a grant.
 */
export function visibleApps(viewer: Viewer, apps: AppRow[], grants: Map<string, AppRole>): AppRow[] {
  return apps
    .filter((a) => a.is_enabled)
    .filter((a) => grants.has(a.key) || (viewer.platform_role === 'admin' && !a.sensitive))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Every account can sign in with a password; emailed links are for invites and recovery. */
export function canUsePassword(_role: PlatformRole): boolean {
  return true;
}

/** Admins may create any role; nobody else manages people. */
export function canManagePeople(role: PlatformRole): boolean {
  return role === 'admin';
}

/** Usernames: 2–32 of a–z, 0–9, . _ -, starting with a letter or digit. Case doesn't matter. */
export const USERNAME_PATTERN = '[a-z0-9][a-z0-9._\\-]{1,31}';

export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  return new RegExp(`^${USERNAME_PATTERN}$`).test(u) ? u : null;
}

/** A username to suggest from someone's name: "Grandma Rose" → "grandma.rose". */
export function usernameFromName(name: string): string {
  const u = name
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32)
    .replace(/\.+$/, '');
  return u.length >= 2 ? u : '';
}

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

/** Only allow redirects back into this site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

/**
 * Who may set a new password for someone (a forgotten password: there's no
 * email). That's as good as signing in as them, so: the admin may do it for
 * anyone else; a host only for family-member accounts they made themselves
 * (whatever their own platform role: event co-hosts are often family
 * members). Nobody does it for themselves (that's the account page).
 */
export function canResetPassword(
  actor: { id: string; platform_role: PlatformRole },
  target: { id: string; platform_role: PlatformRole; created_by: string | null; is_active: boolean },
): boolean {
  if (actor.id === target.id || !target.is_active) return false;
  if (actor.platform_role === 'admin') return true;
  return target.platform_role === 'member' && target.created_by === actor.id;
}
