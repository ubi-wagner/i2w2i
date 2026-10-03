import Link from 'next/link';
import { Header } from '@/components/Header';
import { requireApp } from '@/lib/apps';
import { withCtx } from '@/lib/events/db';
import { userCtx } from '@/lib/events/session';

export const metadata = { title: 'Events' };

interface Row {
  id: string;
  slug: string;
  title: string;
  starts_on: Date | null;
  status: string;
  role: string | null;
  uploads: number;
}

export default async function EventsHome() {
  const { user } = await requireApp('events');
  const ctx = userCtx(user);
  // RLS limits this to events the person belongs to (admin sees all).
  const events = await withCtx(ctx, (tx) => tx<Row[]>`
    SELECT e.id, e.slug, e.title, e.starts_on, e.status, events.member_role(e.id) AS role,
           (SELECT count(*)::int FROM events.uploads u WHERE u.event_id = e.id AND u.status = 'ready') AS uploads
      FROM events.events e
     WHERE events.is_member(e.id)
     ORDER BY coalesce(e.starts_on, e.created_at::date) DESC`);
  const canCreate = user.platform_role !== 'member';

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Events</h1>
          {canCreate && <Link href="/events/new" className="btn">New event</Link>}
        </div>
        {events.length === 0 ? (
          <div className="card text-stone-600">{canCreate ? 'No events yet. Create the first one.' : 'You haven’t been added to any events yet.'}</div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {events.map((e) => (
              <li key={e.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">{e.title}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${e.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-600'}`}>
                    {e.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-sm text-stone-600">
                  {e.starts_on ? e.starts_on.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'medium' }) : 'No date'} · {e.uploads} photos &amp; videos
                </p>
                <div className="flex gap-3 text-sm">
                  <Link href={`/album/${e.slug}`} className="text-brand hover:underline">Open album</Link>
                  {(e.role === 'owner' || e.role === 'curator' || ctx.admin) && (
                    <Link href={`/events/${e.id}`} className="text-brand hover:underline">Manage</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
