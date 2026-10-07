import Link from 'next/link';
import { CopyText } from '@/components/CopyText';
import { decryptCode } from '@/lib/events/codes';
import { withCtx } from '@/lib/events/db';
import { loadManage } from '@/lib/events/manage';
import { albumUrl, qrLink, qrSvg } from '@/lib/events/qr';
import { changeAccessCode } from '../../../actions';
import { CodeForm } from '../../CodeForm';

interface Code {
  id: string; label: string; code_enc: Buffer | null; qr_version: number; can_upload: boolean; can_view: boolean;
  code_revoked_at: Date | null; qr_revoked_at: Date | null; guests: number;
}

/** Guest codes and their QR, table cards and posters to print; the album's own link and QR. */
export default async function QrTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, owner } = await loadManage(id);
  if (!owner) return <p className="card text-stone-600">Only the event’s co-hosts make guest codes and print QR cards.</p>;
  const codes = await withCtx(ctx, (tx) => tx<Code[]>`
    SELECT c.id, c.label, c.code_enc, c.qr_version, c.can_upload, c.can_view, c.code_revoked_at, c.qr_revoked_at,
           (SELECT count(*)::int FROM events.guests g WHERE g.access_code_id = c.id) AS guests
      FROM events.access_codes c WHERE c.event_id = ${id} ORDER BY c.created_at`);
  const links = codes.map((c) => (c.qr_revoked_at ? null : qrLink(event.slug, c.id, c.qr_version)));
  const qrs = await Promise.all(links.map((l) => (l ? qrSvg(l) : null)));
  const albumQr = await qrSvg(albumUrl(event.slug));

  return (
    <div className="space-y-6">
      <section id="codes" className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Guest codes &amp; QR cards</h2>
          <p className="text-sm text-stone-600">
            Guests without an account scan a code’s QR (or go to <b>{albumUrl(event.slug)}</b> and type it). They give their name and can then add photos (and see the album, if the code allows). Print a small card for each table, or a poster for the door.
          </p>
        </div>
        {codes.length === 0 && <p className="text-sm text-stone-500">No guest codes yet: make the first one below.</p>}
        <ul className="space-y-3">
          {codes.map((c, i) => {
            const typed = decryptCode(c.code_enc);
            return (
              <li key={c.id} className="flex flex-wrap items-start gap-4 rounded-xl border border-stone-200 p-4">
                {qrs[i] ? (
                  <div className="h-28 w-28 shrink-0 rounded-lg border border-stone-200 bg-white p-1.5" dangerouslySetInnerHTML={{ __html: qrs[i]! }} />
                ) : (
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded bg-stone-100 text-center text-xs text-stone-500">QR turned off</div>
                )}
                <div className="grow space-y-1 text-sm">
                  <p className="text-base font-semibold">
                    {typed ? <span className="font-mono">{typed}</span> : 'QR only'}
                    {c.label && <span className="ml-2 font-normal text-stone-500">{c.label}</span>}
                  </p>
                  <p className="text-stone-600">{[c.can_upload && 'Can add photos', c.can_view && 'can see the album'].filter(Boolean).join(', ')} · {c.guests} guests joined</p>
                  {c.code_revoked_at && typed && <p className="text-red-600">Typed code turned off</p>}
                  {links[i] && <CopyText text={links[i]!} />}
                  {!c.qr_revoked_at && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link className="btn-secondary btn-sm" href={`/events/${id}/codes/${c.id}`}>Print card</Link>
                      <Link className="btn-secondary btn-sm" href={`/events/${id}/poster/${c.id}`}>Print poster</Link>
                    </div>
                  )}
                  <div className="-ml-2.5 flex flex-wrap gap-1 pt-1">
                    {[
                      typed && !c.code_revoked_at && ['revoke_code', 'Turn off typed code'],
                      typed && c.code_revoked_at && ['restore_code', 'Turn typed code back on'],
                      !c.qr_revoked_at && ['revoke_qr', 'Turn off QR'],
                      ['reissue_qr', c.qr_revoked_at ? 'Make a new QR' : 'Replace QR (old cards stop working)'],
                    ].filter((x): x is [string, string] => Boolean(x)).map(([action, label]) => (
                      <form key={action} action={changeAccessCode}>
                        <input type="hidden" hidden name="event_id" value={id} />
                        <input type="hidden" hidden name="code_id" value={c.id} />
                        <input type="hidden" hidden name="action" value={action} />
                        <button className={action.startsWith('restore') ? 'btn-ghost' : 'btn-danger'}>{label}</button>
                      </form>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="rounded-xl bg-stone-50 p-4"><CodeForm eventId={id} /></div>
      </section>

      <section id="album-card" className="card space-y-3">
        <h2 className="text-lg font-semibold">The album’s own link</h2>
        <div className="flex flex-wrap items-start gap-4">
          <div className="h-28 w-28 shrink-0" dangerouslySetInnerHTML={{ __html: albumQr }} />
          <div className="grow space-y-2 text-sm">
            <p className="text-stone-600">No code in it: for people already on the event, or once the event is published to the family or to anyone with the link. Guests at the event need a guest code instead. Albums you make public have their own link and QR on their page (Albums tab).</p>
            <CopyText text={albumUrl(event.slug)} />
            <div className="flex flex-wrap gap-2">
              <Link href={`/events/${id}/card`} className="btn-secondary btn-sm">Album card</Link>
              <Link href={`/events/${id}/poster/album`} className="btn-secondary btn-sm">Album poster</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
