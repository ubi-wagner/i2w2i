import { Header } from '@/components/Header';
import { requireAdmin } from '@/lib/auth/session';
import { allApps } from '@/lib/apps';
import { sql } from '@/lib/db';
import type { AppRole, PlatformRole } from '@/lib/access';
import { InviteForm, ResendButton } from './InviteForms';
import { setActive, setAppRole, setPlatformRole } from './actions';

export const metadata = { title: 'People' };

interface Person {
  id: string;
  email: string;
  display_name: string;
  platform_role: PlatformRole;
  is_active: boolean;
  last_login_at: Date | null;
  grants: Record<string, AppRole> | null;
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [people, apps] = await Promise.all([
    sql<Person[]>`
      SELECT u.id, u.email, u.display_name, u.platform_role, u.is_active, u.last_login_at,
             (SELECT jsonb_object_agg(g.app_key, g.role) FROM core.user_app_roles g WHERE g.user_id = u.id) AS grants
        FROM core.users u
       ORDER BY u.is_active DESC, u.display_name`,
    allApps(),
  ]);

  return (
    <>
      <Header user={admin} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <section className="card space-y-4">
          <h1 className="text-xl font-semibold">Invite someone</h1>
          <InviteForm />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">People ({people.length})</h2>
          <ul className="space-y-3">
            {people.map((p) => {
              const self = p.id === admin.id;
              return (
                <li key={p.id} className={`card space-y-3 ${p.is_active ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{p.display_name}{self && ' (you)'}</p>
                      <p className="text-sm text-stone-600">{p.email}</p>
                      <p className="text-xs text-stone-500">
                        {p.last_login_at ? `Last signed in ${p.last_login_at.toLocaleDateString()}` : 'Hasn’t signed in yet'}
                      </p>
                    </div>
                    {!self && (
                      <div className="flex flex-wrap items-center gap-3">
                        <form action={setPlatformRole} className="flex items-center gap-2">
                          <input type="hidden" hidden name="user_id" value={p.id} />
                          <select name="platform_role" defaultValue={p.platform_role} className="input w-auto py-1 text-sm">
                            <option value="member">Family member</option>
                            <option value="creator">Creator</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button className="btn-secondary py-1 text-sm">Save</button>
                        </form>
                        <form action={setActive}>
                          <input type="hidden" hidden name="user_id" value={p.id} />
                          <input type="hidden" hidden name="active" value={String(!p.is_active)} />
                          <button className="text-sm text-stone-600 hover:underline">{p.is_active ? 'Deactivate' : 'Reactivate'}</button>
                        </form>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {apps.filter((a) => a.is_enabled || p.grants?.[a.key]).map((a) => (
                      <form key={a.key} action={setAppRole} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2 py-1 text-sm">
                        <input type="hidden" hidden name="user_id" value={p.id} />
                        <input type="hidden" hidden name="app_key" value={a.key} />
                        <span>{a.name}{!a.is_enabled && ' (not live)'}</span>
                        <select name="role" defaultValue={p.grants?.[a.key] ?? 'none'} className="rounded border border-stone-300 bg-white px-1 py-0.5">
                          <option value="none">No access</option>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="owner">Owner</option>
                        </select>
                        <button className="text-brand hover:underline">Set</button>
                      </form>
                    ))}
                  </div>
                  {p.is_active && !self && <ResendButton userId={p.id} />}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
