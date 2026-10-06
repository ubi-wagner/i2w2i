import Link from 'next/link';
import { CopyText } from '@/components/CopyText';
import { Header } from '@/components/Header';
import { ManageTabs, type ManageTab } from '@/components/events/ManageTabs';
import { loadManage, waitingCount } from '@/lib/events/manage';
import { albumUrl } from '@/lib/events/qr';

export const metadata = { title: 'Manage event' };

/** Every manage page: the event's name, the way to the album, and the tabs. */
export default async function ManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, event, owner } = await loadManage(id);
  const waiting = await waitingCount(id);
  const base = `/events/${id}`;
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/events" className="text-sm text-stone-500 hover:underline">← Events</Link>
            <h1 className="text-2xl font-semibold">{event.title}</h1>
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
