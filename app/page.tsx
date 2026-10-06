import Link from 'next/link';
import { Header } from '@/components/Header';
import { InstallCard } from '@/components/pwa/InstallCard';
import { EventCards } from '@/components/events/EventCards';
import { requireUser } from '@/lib/auth/session';
import { appsForUser } from '@/lib/apps';
import { userCtx } from '@/lib/events/session';

export const metadata = { title: 'Home' };

export default async function Dashboard() {
  const user = await requireUser();
  const apps = await appsForUser(user);
  const hasEvents = apps.some((a) => a.app.key === 'events');
  const others = apps.filter((a) => a.app.key !== 'events');
  const canCreate = user.platform_role !== 'member';

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Hi {user.display_name.split(' ')[0]}</h1>
          <p className="text-stone-600">{hasEvents ? 'Your events and the family’s albums.' : 'Your family apps.'}</p>
        </div>
        <InstallCard />
        {!apps.length && <div className="card text-stone-600">Nothing has been shared with you yet. Ask the person who invited you, or Eric.</div>}
        {hasEvents && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Your events</h2>
              {canCreate && <Link href="/events/new" className="btn btn-sm">+ New event</Link>}
            </div>
            <EventCards
              ctx={userCtx(user)}
              limit={6}
              empty={(
                <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
                  <p className="font-medium">{canCreate ? 'No events yet' : 'You’re not on any events yet'}</p>
                  <p className="mt-1 text-sm text-stone-600">{canCreate ? 'Make one for a party, a shower or a wedding: a page for guests, QR cards for the tables and a shared album.' : 'When someone adds you to an event, it shows here.'}</p>
                  {canCreate && <Link href="/events/new" className="btn mt-4">Create your first event</Link>}
                </div>
              )}
            />
          </section>
        )}
        {hasEvents && (
          <EventCards
            ctx={userCtx(user)}
            shared
            limit={6}
            empty={null}
            heading={<h2 className="text-lg font-semibold">Family albums</h2>}
          />
        )}
        {others.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Apps</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {others.map(({ app }) => (
                <li key={app.key}>
                  <Link href={app.path} className="card block h-full transition hover:border-brand hover:shadow-md">
                    <h3 className="text-lg font-semibold">{app.name}</h3>
                    <p className="mt-1 text-sm text-stone-600">{app.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
