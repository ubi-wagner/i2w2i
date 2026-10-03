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
          {canCreate && <Link href="/events/new" className="btn">New event</Link>}
        </div>
        <EventCards
          ctx={userCtx(user)}
          empty={<div className="card text-stone-600">{canCreate ? 'No events yet. Create the first one.' : 'You’re not on any events yet.'}</div>}
        />
        <EventCards ctx={userCtx(user)} shared empty={null} heading={<h2 className="pt-6 text-lg font-semibold">Family albums</h2>} />
      </main>
    </>
  );
}
