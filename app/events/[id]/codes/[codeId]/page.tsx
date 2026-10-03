import { notFound } from 'next/navigation';
import { requireApp } from '@/lib/apps';
import { decryptCode } from '@/lib/events/codes';
import { withCtx } from '@/lib/events/db';
import { albumUrl, qrLink, qrSvg } from '@/lib/events/qr';
import { userCtx } from '@/lib/events/session';
import { PrintButton } from './PrintButton';

export const metadata = { title: 'QR card' };

export default async function CodeCard({ params }: { params: Promise<{ id: string; codeId: string }> }) {
  const { id, codeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(codeId)) notFound();
  const { user } = await requireApp('events');
  // RLS: only owners can read access codes.
  const row = await withCtx(userCtx(user), async (tx) => {
    const [r] = await tx<{ slug: string; title: string; starts_on: Date | null; code_enc: Buffer | null; qr_version: number; qr_revoked_at: Date | null; can_upload: boolean }[]>`
      SELECT e.slug, e.title, e.starts_on, c.code_enc, c.qr_version, c.qr_revoked_at, c.can_upload
        FROM events.access_codes c JOIN events.events e ON e.id = c.event_id
       WHERE c.id = ${codeId} AND c.event_id = ${id}`;
    return r;
  });
  if (!row || row.qr_revoked_at) notFound();
  const svg = await qrSvg(qrLink(row.slug, codeId, row.qr_version));
  const typed = decryptCode(row.code_enc);
  const url = albumUrl(row.slug).replace(/^https?:\/\//, '');

  return (
    <main className="mx-auto max-w-md px-6 py-10 text-center print:py-0">
      <div className="space-y-5 rounded-3xl border-2 border-stone-200 bg-white p-8 print:border-stone-400">
        <p className="text-sm uppercase tracking-widest text-brand">{row.can_upload ? 'Share your photos & videos' : 'See the photos'}</p>
        <h1 className="font-serif text-3xl">{row.title}</h1>
        {row.starts_on && <p className="text-stone-600">{row.starts_on.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'long' })}</p>}
        <div className="mx-auto w-64" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-lg">Scan with your phone camera</p>
        {typed && (
          <p className="text-sm text-stone-600">
            or go to <b>{url}</b><br />and enter code <b className="font-mono text-base text-stone-900">{typed}</b>
          </p>
        )}
        <p className="text-xs text-stone-500">No app or account needed</p>
      </div>
      <PrintButton />
    </main>
  );
}
