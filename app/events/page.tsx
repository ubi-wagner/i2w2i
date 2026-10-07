import Link from 'next/link';
import { Header } from '@/components/Header';
import { EventCards } from '@/components/events/EventCards';
import { requireApp } from '@/lib/apps';
import { userCtx } from '@/lib/events/session';

export const metadata = { title: 'Events' };

export default async function EventsHome() {
  const { user } = await requireApp('events');
  const canCreate = user.platform_role !== 'member';
  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Events</h1>
          {canCreate && <Link href="/events/new" className="btn">+ New event</Link>}
        </div>
        <EventCards
          ctx={userCtx(user)}
          newTile={canCreate}
          empty={(
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
              <p className="font-medium">{canCreate ? 'No events yet' : 'You’re not on any events yet'}</p>
              <p className="mt-1 text-sm text-stone-600">{canCreate ? 'Make one for a party, a shower or a wedding: a page for guests, QR cards for the tables and a shared album.' : 'When someone adds you to an event, it shows here.'}</p>
              {canCreate && <Link href="/events/new" className="btn mt-4">Create your first event</Link>}
            </div>
          )}
        />
        <EventCards ctx={userCtx(user)} shared empty={null} heading={<h2 className="pt-6 text-lg font-semibold">Family albums</h2>} />
      </main>
    </>
  );
}
