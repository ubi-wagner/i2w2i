import { Header } from '@/components/Header';
import { requireUser } from '@/lib/auth/session';
import { canUsePassword } from '@/lib/access';
import { PasswordForm } from './PasswordForm';
import { signOutEverywhere, updateName } from './actions';

export const metadata = { title: 'Your account' };

const ROLE_LABEL = { admin: 'Family admin', creator: 'Creator', member: 'Family member' } as const;

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string; reset?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const welcome = sp.welcome && !user.has_password;
  const reset = sp.reset && user.has_password && user.fresh_link;

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        {welcome && (
          <div className="rounded-xl bg-brand-light p-4 text-brand-dark">
            Welcome! Choose a password so you can sign in with your email and password next time.
          </div>
        )}
        {reset && (
          <div className="rounded-xl bg-brand-light p-4 text-brand-dark">
            You’re signed in. Choose a new password below so you can sign in with it next time.
          </div>
        )}
        <section className="card space-y-4">
          <h1 className="text-xl font-semibold">Your account</h1>
          <p className="text-sm text-stone-600">{user.email} · {ROLE_LABEL[user.platform_role]}</p>
          <form action={updateName} className="flex gap-2">
            <input className="input" name="display_name" defaultValue={user.display_name} aria-label="Display name" maxLength={80} />
            <button className="btn-secondary">Save</button>
          </form>
        </section>

        {canUsePassword(user.platform_role) && (
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Password</h2>
            <PasswordForm hasPassword={user.has_password} needCurrent={user.has_password && !user.fresh_link} />
          </section>
        )}

        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">Devices</h2>
          <p className="text-sm text-stone-600">Signed in on a phone you no longer have? Sign out of every device at once.</p>
          <form action={signOutEverywhere}><button className="btn-secondary">Sign out everywhere</button></form>
        </section>
      </main>
    </>
  );
}
