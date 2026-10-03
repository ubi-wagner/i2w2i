import { notFound } from 'next/navigation';
import { requireApp } from '@/lib/apps';
import { eventForCtx, canManage } from '@/lib/events/queries';
import { albumUrl, qrSvg } from '@/lib/events/qr';
import { userCtx } from '@/lib/events/session';
import { PrintCard } from '@/components/events/PrintCard';
import { PrintButton } from '../codes/[codeId]/PrintButton';

export const metadata = { title: 'Album card' };

// The plain album address as a card: for albums shared with the family or
// the public, where no code is needed to look.
export default async function AlbumCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user } = await requireApp('events');
  const ctx = userCtx(user);
  const found = await eventForCtx(ctx, id);
  if (!found || !canManage(ctx, found.role)) notFound();
  const { event } = found;
  const url = albumUrl(event.slug);
  const svg = await qrSvg(url);
  const who = event.status !== 'published' ? 'Not published yet: only people on the event can open it.'
    : event.audience === 'public' ? 'Anyone with this link can look.'
    : event.audience === 'family' ? 'Family members sign in to look.'
    : 'People on the event, and guests with a code, can look.';
  return (
    <PrintCard
      theme={event.theme} kicker="See the photos" title={event.title} startsOn={event.starts_on} location={event.location} qr={svg}
      after={<><p className="mt-4 text-sm text-stone-500 print:hidden">{who}</p><PrintButton /></>}
    >
      <p className="text-lg">Scan with your phone camera</p>
      <p className="text-sm text-stone-600">or go to <b>{url.replace(/^https?:\/\//, '')}</b></p>
    </PrintCard>
  );
}
