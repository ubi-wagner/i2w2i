import type { LinkRow } from '@/components/events/GiftLinks';
import { withCtx } from '@/lib/events/db';
import { loadManage, pageInitial } from '@/lib/events/manage';
import { removeLink } from '../../../actions';
import { LinkForm } from '../../LinkForm';
import { PageEditor } from '../../PageEditor';

/** Event info: directions, schedule, good to know, and gifts. */
export default async function InfoTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, owner } = await loadManage(id);
  const links = await withCtx(ctx, (tx) => tx<LinkRow[]>`SELECT id, kind, label, url FROM events.links WHERE event_id = ${id} ORDER BY sort_order, created_at`);
  return (
    <div className="space-y-6">
      <section id="page" className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Event info</h2>
          <p className="text-sm text-stone-600">Each part adds a button on the landing page (Directions, Schedule, Good to know, Send a gift) that opens it. Only people who can see the album get the address.</p>
        </div>
        <PageEditor part="info" eventId={event.id} slug={event.slug} hasGiftLinks={links.length > 0} initial={pageInitial(event)} />
      </section>

      {owner && (
        <section id="gifts" className="card space-y-4">
          <h2 className="text-lg font-semibold">Gifts &amp; payments</h2>
          <p className="text-sm text-stone-600">Shown on the album with a QR code each, for Venmo, a registry and the like. Money never passes through i2w2i.</p>
          {links.length > 0 && (
            <ul className="divide-y divide-stone-100 text-sm">
              {links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <span><b>{l.label}</b> <a className="text-brand underline" href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></span>
                  <form action={removeLink}>
                    <input type="hidden" hidden name="event_id" value={id} />
                    <input type="hidden" hidden name="link_id" value={l.id} />
                    <button className="text-stone-500 hover:underline">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <LinkForm eventId={id} />
        </section>
      )}
    </div>
  );
}
