import { notFound } from 'next/navigation';
import { requireApp } from '@/lib/apps';
import { decryptCode } from '@/lib/events/codes';
import { withCtx } from '@/lib/events/db';
import { albumUrl, qrLink, qrSvg } from '@/lib/events/qr';
import { userCtx } from '@/lib/events/session';
import { PrintCard } from '@/components/events/PrintCard';
import type { ThemeId } from '@/lib/events/themes';
import { PrintButton } from './PrintButton';

export const metadata = { title: 'QR card' };

export default async function CodeCard({ params }: { params: Promise<{ id: string; codeId: string }> }) {
  const { id, codeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(codeId)) notFound();
  const { user } = await requireApp('events');
  // RLS: only owners can read access codes.
  const row = await withCtx(userCtx(user), async (tx) => {
    const [r] = await tx<{ slug: string; title: string; starts_on: Date | null; location: string; theme: ThemeId; code_enc: Buffer | null; qr_version: number; qr_revoked_at: Date | null; can_upload: boolean }[]>`
      SELECT e.slug, e.title, e.starts_on, e.location, e.theme, c.code_enc, c.qr_version, c.qr_revoked_at, c.can_upload
        FROM events.access_codes c JOIN events.events e ON e.id = c.event_id
       WHERE c.id = ${codeId} AND c.event_id = ${id}`;
    return r;
  });
  if (!row || row.qr_revoked_at) notFound();
  const svg = await qrSvg(qrLink(row.slug, codeId, row.qr_version));
  const typed = decryptCode(row.code_enc);
  const url = albumUrl(row.slug).replace(/^https?:\/\//, '');

  return (
    <PrintCard
      theme={row.theme} kicker={row.can_upload ? 'Share your photos & videos' : 'See the photos'}
      title={row.title} startsOn={row.starts_on} location={row.location} qr={svg} after={<PrintButton />}
    >
      <p className="text-lg">Scan with your phone camera</p>
      {typed && (
        <p className="text-sm text-stone-600">
          or go to <b>{url}</b><br />and enter code <b className="font-mono text-base text-stone-900">{typed}</b>
        </p>
      )}
      <p className="text-xs text-stone-500">No app or account needed</p>
    </PrintCard>
  );
}
