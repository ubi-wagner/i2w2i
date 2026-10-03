import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Chat } from '@/components/events/Chat';
import { Gallery } from '@/components/events/Gallery';
import { GiftLinks, type LinkRow } from '@/components/events/GiftLinks';
import { ActionBar, type EventAction } from '@/components/events/ActionBar';
import { InstallCard } from '@/components/pwa/InstallCard';
import { DirectionsPanel, InfoPanel, SchedulePanel } from '@/components/events/EventPanels';
import { EventHero, ThemeFrame } from '@/components/events/ThemeFrame';
import { cleanPage } from '@/lib/events/page';
import { Uploader } from '@/components/events/Uploader';
import { logActivity } from '@/lib/events/activity';
import { loadAlbum } from '@/lib/events/album';
import { rateLimit } from '@/lib/rate-limit';
import { requestMeta } from '@/lib/request-meta';
import { withCtx } from '@/lib/events/db';
import { GALLERY_SQL_COLUMNS, toGallery, type UploadRow } from '@/lib/events/queries';
import { publicEvent } from '@/lib/events/session';
import { leaveAlbum } from './actions';
import { JoinForm } from './JoinForm';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const e = /^[a-z0-9-]+$/.test(slug) ? await publicEvent(slug) : null;
  return { title: e?.title ?? 'Album' };
}

export default async function AlbumPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { t } = await searchParams;
  const album = await loadAlbum(slug);
  if (!album) notFound();
  const { event } = album;

  // Record visits (including QR scans) by anyone who isn't running the event.
  if (!album.canManage) {
    const { deviceId, ip } = await requestMeta();
    if (rateLimit(`view:${event.id}:${deviceId ?? ip}:${t ? 'qr' : ''}`, 1, 60 * 60_000)) {
      await logActivity({
        eventId: event.id,
        action: t ? 'album.qr_scan' : 'album.view',
        userId: album.user?.id ?? null,
        guestId: album.guest?.id ?? null,
        actorName: album.guest?.display_name ?? album.user?.display_name ?? null,
      });
    }
  }

  // Signed-in people on the event don't need the QR's guest flow.
  if (t && album.isMember) redirect(`/album/${slug}`);
  const token = t && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : undefined;

  const theme = event.theme;
  // Before joining, only the invitation wording; after, everything the hosts wrote.
  const lines = album.canView || album.canUpload ? album.page : cleanPage(event.page_public);
  const header = <EventHero theme={theme} title={event.title} startsOn={event.starts_on} location={event.location} lines={lines} />;

  // Arrived by QR, or has nothing yet: join with a name (and a code).
  if (token || (!album.canUpload && !album.canView)) {
    return (
      <ThemeFrame theme={theme}>
        <main className="mx-auto max-w-md space-y-6 px-4 py-10">
          {header}
          <div className="card space-y-4">
            <p className="text-center text-stone-700">
              {token ? 'Welcome! Add your name to share your photos and videos.' : 'Enter the code from your invitation or table card.'}
            </p>
            <JoinForm slug={slug} token={token} />
          </div>
          {!album.user && (
            <p className="text-center text-sm text-stone-500">
              Family member? <Link href={`/login?next=/album/${slug}`} className="text-brand underline">Sign in</Link>
            </p>
          )}
        </main>
      </ThemeFrame>
    );
  }

  const { rows, links } = await withCtx(album.ctx, async (tx) => ({
    rows: await tx<UploadRow[]>`
      SELECT ${tx.unsafe(GALLERY_SQL_COLUMNS)} FROM events.uploads u WHERE u.event_id = ${event.id} AND u.status = 'ready'
       ORDER BY u.featured DESC, u.created_at DESC LIMIT 2000`,
    links: await tx<LinkRow[]>`SELECT id, kind, label, url FROM events.links WHERE event_id = ${event.id} ORDER BY sort_order, created_at`,
  }));
  // Hidden items only reach managers; keep them out of the public grid here too.
  const visible = rows.filter((r) => !r.hidden);
  const items = await toGallery(visible, album.ctx, { originals: album.canManage });
  const waiting = items.filter((i) => i.pending && i.mine).length;

  const { page } = album;
  const actions = ([
    Boolean(page.address) && { key: 'directions', label: 'Directions', title: 'Directions', icon: 'pin' as const, panel: <DirectionsPanel place={event.location} address={page.address} /> },
    page.schedule.length > 0 && { key: 'schedule', label: 'Schedule', title: 'Schedule', icon: 'clock' as const, panel: <SchedulePanel items={page.schedule} date={event.starts_on} /> },
    page.info.length > 0 && { key: 'info', label: 'Good to know', title: 'Good to know', icon: 'info' as const, panel: <InfoPanel items={page.info} /> },
    links.length > 0 && { key: 'gifts', label: 'Send a gift', title: 'Send a gift', icon: 'gift' as const, panel: <GiftLinks links={links} note={album.giftNote} bare /> },
  ] as (EventAction | false)[]).filter((a): a is EventAction => Boolean(a));

  return (
    <ThemeFrame theme={theme}>
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <nav className="relative z-10 flex items-center justify-between text-sm">
          <Link href={album.user ? '/' : `/album/${slug}`} className="font-bold text-brand">i2w2i</Link>
          <div className="flex items-center gap-3 text-stone-600">
            {album.canManage && <Link href={`/events/${event.id}`} className="font-medium text-brand hover:underline">Manage</Link>}
            {album.user ? (
              <>
                <Link href="/events" className="hover:underline">Events</Link>
                <Link href="/account" className="hover:underline">{album.user.display_name.split(' ')[0]}</Link>
                <form action="/auth/logout" method="post"><button className="hover:underline">Sign out</button></form>
              </>
            ) : album.guest ? (
              <form action={leaveAlbum} className="flex items-center gap-2">
                <input type="hidden" hidden name="slug" value={slug} />
                <span>{album.guest.display_name}</span>
                <button className="underline">Not you?</button>
              </form>
            ) : (
              <Link href={`/login?next=/album/${slug}`} className="hover:underline">Sign in</Link>
            )}
          </div>
        </nav>

        {header}
        {event.status === 'draft' && (
          <p className="rounded-xl bg-stone-100 p-3 text-center text-sm text-stone-600">
            This album isn’t published yet{album.canManage ? '' : ', but you can already add to it'}.
          </p>
        )}
        {album.description && (
          <p className={`mx-auto max-w-2xl whitespace-pre-wrap text-center text-stone-700 ${theme === 'classic' ? '' : 'font-display text-xl italic'}`}>{album.description}</p>
        )}
        <ActionBar actions={actions} />

        {album.user && (
          <div className="mx-auto max-w-xl">
            <InstallCard />
          </div>
        )}

        {album.canUpload && album.uploaderName && (
          <section className="mx-auto max-w-xl">
            <Uploader slug={slug} name={album.uploaderName} reviewed={!album.canManage} />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{album.canView ? 'Album' : 'Your uploads'}</h2>
          {waiting > 0 && !album.canManage && (
            <p className="rounded-xl bg-brand-light px-4 py-3 text-sm text-brand-dark">
              {waiting === 1 ? 'Your photo is' : `${waiting} of your photos are`} waiting for the hosts. Only you and they can see {waiting === 1 ? 'it' : 'them'} until they add {waiting === 1 ? 'it' : 'them'} to the album.
            </p>
          )}
          <Gallery
            items={items}
            downloadUrl={`/album/${slug}/api/download`}
            commentsSlug={slug}
            empty={album.canView ? 'No photos yet. Be the first!' : 'Nothing from you yet. Your photos and videos will show here.'}
          />
          {!album.canView && <p className="text-sm text-stone-500">The hosts will share the full album later.</p>}
        </section>

        <GiftLinks links={links} note={album.giftNote} />

        {album.chat && (
          <section className="mx-auto max-w-2xl space-y-3">
            <h2 className="text-lg font-semibold">Group chat</h2>
            <Chat slug={slug} />
          </section>
        )}

        {!album.canUpload && !album.user && (
          <section className="mx-auto max-w-md">
            <details className="card">
              <summary className="cursor-pointer font-medium">Have a code? Add your photos</summary>
              <div className="mt-4"><JoinForm slug={slug} /></div>
            </details>
          </section>
        )}
      </main>
    </ThemeFrame>
  );
}
