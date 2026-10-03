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

export function canUsePassword(role: PlatformRole): boolean {
  return role === 'admin' || role === 'creator';
}

/** Admins may create any role; nobody else manages people. */
export function canManagePeople(role: PlatformRole): boolean {
  return role === 'admin';
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
