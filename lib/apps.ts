import 'server-only';
import { notFound } from 'next/navigation';
import { sql } from './db';
import { visibleApps, type AppRole, type AppRow } from './access';
import { requireUser, type CurrentUser } from './auth/session';

export async function allApps(): Promise<AppRow[]> {
  return sql<AppRow[]>`SELECT key, name, description, path, sensitive, is_enabled, sort_order FROM core.apps ORDER BY sort_order`;
}

export async function grantsFor(userId: string): Promise<Map<string, AppRole>> {
  const rows = await sql<{ app_key: string; role: AppRole }[]>`SELECT app_key, role FROM core.user_app_roles WHERE user_id = ${userId}`;
  return new Map(rows.map((r) => [r.app_key, r.role]));
}

export async function appsForUser(user: CurrentUser): Promise<{ app: AppRow; role: AppRole | null }[]> {
  const [apps, grants] = await Promise.all([allApps(), grantsFor(user.id)]);
  return visibleApps(user, apps, grants).map((app) => ({ app, role: grants.get(app.key) ?? null }));
}

/**
 * Gate for an app's pages. Anyone who can't see the app gets a 404, so a
 * sensitive app's existence isn't revealed. Admin counts as owner of
 * non-sensitive apps.
 */
export async function requireApp(key: string): Promise<{ user: CurrentUser; role: AppRole }> {
  const user = await requireUser();
  const entry = (await appsForUser(user)).find((e) => e.app.key === key);
  if (!entry) notFound();
  return { user, role: entry.role ?? 'owner' };
}
