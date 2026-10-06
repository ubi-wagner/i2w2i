import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlbumCards } from '@/components/events/AlbumCards';
import { Gallery } from '@/components/events/Gallery';
import { Slideshow } from '@/components/events/Slideshow';
import { ThemeFrame } from '@/components/events/ThemeFrame';
import { loadAlbum } from '@/lib/events/album';
import { albumMembership, countLabel, listAlbums, toAlbumCards } from '@/lib/events/albums';
import { withCtx } from '@/lib/events/db';
import { toSlides } from '@/lib/events/slideshow';
import { GALLERY_SQL_COLUMNS, toGallery, type UploadRow } from '@/lib/events/queries';
import { publicEvent } from '@/lib/events/session';
import { logActivity } from '@/lib/events/activity';
import { rateLimit } from '@/lib/rate-limit';
import { requestMeta } from '@/lib/request-meta';
import { approveInto, createAlbum, fileIntoAlbum, setAlbumCover } from '../../../../events/album-actions';
import { moderateUpload, moderateUploads } from '../../../../events/actions';

type Params = { params: Promise<{ slug: string; albumSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const e = /^[a-z0-9-]+$/.test(slug) ? await publicEvent(slug) : null;
  return { title: e?.title ?? 'Album' };
}

/**
 * One named album inside an event (“Ceremony”): its photos, once it's
 * published, for everyone who can see the event's photos, or for anyone at
 * all when the hosts made it public. What shows is still the uploads
 * policy's call (approved, not hidden); RLS decides which albums open.
 */
export default async function NamedAlbumPage({ params }: Params) {
  const { slug, albumSlug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(albumSlug)) notFound();
  const album = await loadAlbum(slug);
  if (!album) notFound();
  const { event } = album;

  const data = await withCtx(album.ctx, async (tx) => {
    const [a] = await tx<{ id: string; title: string; description: string; published_at: Date | null }[]>`
      SELECT id, title, description, published_at FROM events.albums WHERE event_id = ${event.id} AND slug = ${albumSlug}`;
    if (!a) return null;
    return {
      a,
      rows: await tx<UploadRow[]>`
        SELECT ${tx.unsafe(GALLERY_SQL_COLUMNS)} FROM events.uploads u JOIN events.album_items i ON i.upload_id = u.id
         WHERE i.album_id = ${a.id} AND u.status = 'ready' AND NOT u.hidden
         ORDER BY u.featured DESC, u.created_at`,
      others: await listAlbums(tx, event.id, { publishedOnly: true }),
      all: album.canManage ? await listAlbums(tx, event.id) : [],
      membership: album.canManage ? await albumMembership(tx, event.id) : new Map<string, string[]>(),
    };
  });
  // Not one they can open. Not in yet (no code, not signed in)? The event's page has the way in.
  if (!data) {
    if (!album.canView) redirect(`/album/${slug}`);
    notFound();
  }
  // Here by the public link alone: just this album, nothing else of the event.
  const visitorOnly = !album.canView;
  if (!album.canManage) {
    const { deviceId, ip } = await requestMeta();
    if (rateLimit(`view:${event.id}:${data.a.id}:${deviceId ?? ip}`, 1, 60 * 60_000)) {
      await logActivity({
        eventId: event.id, action: 'album.view', userId: album.user?.id ?? null, guestId: album.guest?.id ?? null,
        actorName: album.guest?.display_name ?? album.user?.display_name ?? null, detail: { album: data.a.id },
      });
    }
  }
  const items = (await toGallery(data.rows, album.ctx, { originals: album.canManage }))
    .map((g) => (album.canManage ? { ...g, albums: data.membership.get(g.id) ?? [] } : g));
  const cards = await toAlbumCards(data.others.filter((o) => o.photos + o.videos > 0));
  const hostTools = album.canManage
    ? {
        moderation: { eventId: event.id, action: moderateUpload, bulkAction: moderateUploads },
        albums: {
          eventId: event.id,
          list: data.all.map((x) => ({ id: x.id, title: x.title, published: x.published_at !== null })),
          approveInto, fileInto: fileIntoAlbum, create: createAlbum,
          current: { id: data.a.id, title: data.a.title, setCover: setAlbumCover },
        },
      }
    : {};

  return (
    <ThemeFrame theme={event.theme}>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <nav className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link href={`/album/${slug}#albums`} className="font-medium text-brand hover:underline">← {visitorOnly ? `All albums from ${event.title}` : event.title}</Link>
          {album.canManage && <Link href={`/events/${event.id}/albums/${data.a.id}`} className="font-medium text-brand hover:underline">Manage this album</Link>}
        </nav>
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-widest text-brand">Album</p>
          <h1 className="font-display text-4xl font-semibold text-stone-900">{data.a.title}</h1>
          {data.a.description && <p className="mx-auto max-w-2xl whitespace-pre-wrap text-stone-700">{data.a.description}</p>}
          <p className="text-sm text-stone-500">{countLabel(items.filter((i) => i.kind === 'photo').length, items.filter((i) => i.kind === 'video').length)}{data.a.published_at ? '' : ' · a draft: only hosts and editors see it'}</p>
          <div className="flex justify-center pt-1"><Slideshow slides={toSlides(items)} title={data.a.title} /></div>
        </header>
        <Gallery
          items={items}
          {...hostTools}
          downloadUrl={visitorOnly ? undefined : `/album/${slug}/api/download`}
          commentsSlug={visitorOnly ? undefined : slug}
          empty="No photos in this album yet."
        />
        {cards.length > 1 && (
          <section className="space-y-3 pt-4" aria-label="More albums">
            <h2 className="text-center font-display text-2xl font-semibold">More albums</h2>
            <AlbumCards slug={slug} albums={cards} current={albumSlug} />
          </section>
        )}
        {!visitorOnly && <p className="text-center text-sm"><Link href={`/album/${slug}`} className="text-brand underline">All photos from {event.title}</Link></p>}
      </main>
    </ThemeFrame>
  );
}
