import Link from 'next/link';
import { CopyText } from '@/components/CopyText';
import { Header } from '@/components/Header';
import { ManageTabs, type ManageTab } from '@/components/events/ManageTabs';
import { loadManage, waitingCount } from '@/lib/events/manage';
import { albumUrl } from '@/lib/events/qr';

export const metadata = { title: 'Manage event' };

const AUDIENCE = { invitees: 'people on it & code holders', family: 'whole family', public: 'anyone with the link' } as const;

/** Every manage page: the event's name, the way to the album, and the tabs. */
export default async function ManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, event, owner } = await loadManage(id);
  const waiting = await waitingCount(id);
  const base = `/events/${id}`;
  const published = event.status === 'published';
  const facts = [
    event.starts_on?.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'long' }),
    event.location,
  ].filter(Boolean).join(' · ');
  const tabs: ManageTab[] = [
    { href: base, label: 'Overview' },
    { href: `${base}/landing`, label: 'Landing page' },
    { href: `${base}/info`, label: 'Event info' },
    { href: `${base}/people`, label: 'People' },
    { href: `${base}/photos`, label: 'Photos', badge: waiting },
    { href: `${base}/albums`, label: 'Albums' },
    ...(owner ? [{ href: `${base}/qr`, label: 'QR & posters' }] : []),
    { href: `${base}/activity`, label: 'Activity' },
  ];
  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link href="/events" className="text-sm text-stone-500 hover:underline">← Events</Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold">{event.title}</h1>
              <span className={`badge ${published ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-stone-700'}`}>
                {published ? `Published · ${AUDIENCE[event.audience]}` : 'Draft'}
              </span>
            </div>
            {facts && <p className="text-sm text-stone-500">{facts}</p>}
          </div>
          <Link href={`/album/${event.slug}`} className="btn-secondary">Open album</Link>
          <div className="w-full"><CopyText text={albumUrl(event.slug)} label="Copy album link" /></div>
        </div>
        <ManageTabs tabs={tabs} />
        {children}
      </main>
    </>
  );
}
