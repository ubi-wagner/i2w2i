import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireApp } from '@/lib/apps';
import { decryptCode } from '@/lib/events/codes';
import { withCtx } from '@/lib/events/db';
import { canManage, eventForCtx } from '@/lib/events/queries';
import { albumUrl, qrLink, qrSvg } from '@/lib/events/qr';
import { userCtx } from '@/lib/events/session';
import { PrintPoster, type PosterSize } from '@/components/events/PrintPoster';
import { PrintButton } from '../../codes/[codeId]/PrintButton';

export const metadata = { title: 'Poster' };

/**
 * A full-page poster: for a guest code ("Share your photos", with its QR and
 * typed code) or, with "album", the plain album link ("See the photos").
 */
export default async function Poster({ params, searchParams }: {
  params: Promise<{ id: string; which: string }>;
  searchParams: Promise<{ size?: string }>;
}) {
  const { id, which } = await params;
  const size: PosterSize = (await searchParams).size === 'a4' ? 'a4' : 'letter';
  if (!/^[0-9a-f-]{36}$/.test(id) || (which !== 'album' && !/^[0-9a-f-]{36}$/.test(which))) notFound();
  const { user } = await requireApp('events');
  const ctx = userCtx(user);
  const found = await eventForCtx(ctx, id);
  if (!found || !canManage(ctx, found.role)) notFound();
  const { event } = found;
  const site = albumUrl(event.slug).replace(/^https?:\/\//, '');

  let qr: string;
  let headline = 'See the photos';
  let body: React.ReactNode = <p className="text-lg">or go to <b>{site}</b></p>;
  if (which === 'album') {
    qr = await qrSvg(albumUrl(event.slug));
  } else {
    // RLS: only co-hosts can read access codes.
    const code = await withCtx(ctx, async (tx) => {
      const [r] = await tx<{ code_enc: Buffer | null; qr_version: number; qr_revoked_at: Date | null; can_upload: boolean }[]>`
        SELECT code_enc, qr_version, qr_revoked_at, can_upload FROM events.access_codes WHERE id = ${which} AND event_id = ${id}`;
      return r;
    });
    if (!code || code.qr_revoked_at) notFound();
    qr = await qrSvg(qrLink(event.slug, which, code.qr_version));
    const typed = decryptCode(code.code_enc);
    if (code.can_upload) headline = 'Share your photos & videos';
    body = (
      <>
        {typed && <p className="text-lg">No camera? Go to <b>{site}</b> and enter code <b className="font-mono text-2xl text-stone-900">{typed}</b></p>}
        <p className="text-sm text-stone-500">No app or account needed</p>
      </>
    );
  }
  const other: PosterSize = size === 'a4' ? 'letter' : 'a4';
  return (
    <PrintPoster
      theme={event.theme} headline={headline} title={event.title} startsOn={event.starts_on} location={event.location} qr={qr} size={size}
      after={
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm print:hidden">
          <span>Paper: <b>{size === 'a4' ? 'A4' : 'US Letter'}</b> · <Link href={`?size=${other}`} className="text-brand underline">use {other === 'a4' ? 'A4' : 'US Letter'}</Link></span>
          <PrintButton />
        </div>
      }
    >
      {body}
    </PrintPoster>
  );
}
