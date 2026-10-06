import Link from 'next/link';
import { NotifyToggle } from '@/components/pwa/NotifyToggle';
import { withCtx } from '@/lib/events/db';
import { loadManage, waitingCount } from '@/lib/events/manage';
import { cleanPage } from '@/lib/events/page';
import { SettingsForm } from '../SettingsForm';

/** Overview: what needs doing, how far along the event is, and publishing. */
export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, owner } = await loadManage(id);
  const waiting = await waitingCount(id);
  const base = `/events/${id}`;
  const n = await withCtx(ctx, async (tx) => {
    const [r] = await tx<{ photos: number; members: number; guests: number; albums: number; published: number; codes: number }[]>`
      SELECT (SELECT count(*)::int FROM events.uploads WHERE event_id = ${id} AND status = 'ready') AS photos,
             (SELECT count(*)::int FROM events.members WHERE event_id = ${id}) AS members,
             (SELECT count(*)::int FROM events.guests WHERE event_id = ${id} AND revoked_at IS NULL) AS guests,
             (SELECT count(*)::int FROM events.albums WHERE event_id = ${id}) AS albums,
             (SELECT count(*)::int FROM events.albums WHERE event_id = ${id} AND published_at IS NOT NULL) AS published,
             (SELECT count(*)::int FROM events.access_codes WHERE event_id = ${id}) AS codes`;
    return r!;
  });
  const pg = cleanPage(event.page);
  const steps = [
    { href: `${base}/landing`, label: 'Make the landing page yours: the look and the invitation wording', done: event.theme !== 'classic' || Boolean(pg.kicker || pg.inviteLine) },
    { href: `${base}/info`, label: 'Add the event info: address, schedule, good to know', done: Boolean(pg.address || pg.schedule.length || pg.info.length) },
    { href: `${base}/people`, label: 'Add the people helping with this event', done: n.members > 1 },
    ...(owner ? [{ href: `${base}/qr`, label: 'Make a guest code and print its QR card or poster', done: n.codes > 0 }] : []),
    { href: `/album/${event.slug}`, label: 'Add the first photos from the album page', done: n.photos > 0 },
    { href: `${base}/albums`, label: 'Make an album (Ceremony, Reception…) and publish it', done: n.published > 0 },
    { href: '#publishing', label: 'Publish the event when you’re ready', done: event.status === 'published' },
  ];
  const stats: [string, string, string][] = [
    [`${base}/photos`, `${n.photos}`, n.photos === 1 ? 'photo or video' : 'photos & videos'],
    [`${base}/albums`, `${n.published} of ${n.albums}`, 'albums published'],
    [`${base}/people`, `${n.members}`, n.members === 1 ? 'person on the event' : 'people on the event'],
    [`${base}/people#guests`, `${n.guests}`, n.guests === 1 ? 'guest joined by code' : 'guests joined by code'],
  ];

  return (
    <div className="space-y-6">
      {waiting > 0 && (
        <Link href={`${base}/photos`} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 hover:border-amber-500">
          <span><b>{waiting} new {waiting === 1 ? 'photo is' : 'photos are'} waiting for your OK.</b> Nobody else sees {waiting === 1 ? 'it' : 'them'} until you approve.</span>
          <span className="shrink-0 font-medium underline">Review</span>
        </Link>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([href, big, small]) => (
          <li key={small}>
            <Link href={href} className="card block h-full p-4 hover:border-brand">
              <span className="block text-2xl font-semibold">{big}</span>
              <span className="text-sm text-stone-600">{small}</span>
            </Link>
          </li>
        ))}
      </ul>

      {steps.some((st) => !st.done) && (
        <section className="card space-y-2 border-brand/40 bg-brand-light/40">
          <h2 className="font-semibold">Getting this event ready</h2>
          <ol className="space-y-1 text-sm">
            {steps.map((st) => (
              <li key={st.label} className={st.done ? 'text-stone-400 line-through' : ''}>
                <span className="mr-2">{st.done ? '✓' : '○'}</span>
                {st.done ? st.label : <Link href={st.href} className="text-brand-dark underline">{st.label}</Link>}
              </li>
            ))}
          </ol>
          <p className="pt-1 text-sm text-stone-600">New to this? The <Link href="/help/hosting" className="text-brand-dark underline">step-by-step guide</Link> walks through each part.</p>
        </section>
      )}

      <section id="publishing" className="scroll-mt-16 card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Publishing</h2>
          <p className="text-sm text-stone-600">Whether the event’s page and all its photos are out, and who can see them. Each album inside it is published on its own, private or public, on the Albums tab.</p>
        </div>
        <SettingsForm event={{ id: event.id, status: event.status, audience: event.audience, chat_enabled: event.chat_enabled }} />
      </section>

      <section aria-label="Notifications" className="rounded-2xl border border-stone-200 bg-white px-5 py-4">
        <NotifyToggle purpose="Get a notification on this phone when guests’ photos are waiting for your OK." />
      </section>
    </div>
  );
}
