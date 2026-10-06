import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyText } from '@/components/CopyText';
import { Gallery } from '@/components/events/Gallery';
import { albumMembership, countLabel, listAlbums } from '@/lib/events/albums';
import { withCtx } from '@/lib/events/db';
import { eventAudienceLabel, loadManage } from '@/lib/events/manage';
import { albumUrl, qrSvg } from '@/lib/events/qr';
import { GALLERY_SQL_COLUMNS, toGallery, type UploadRow } from '@/lib/events/queries';
import { approveInto, createAlbum, fileIntoAlbum, publishAlbum, setAlbumCover } from '../../../../album-actions';
import { moderateUpload, moderateUploads } from '../../../../actions';
import { AlbumAudienceForm, AlbumSettingsForm, DeleteAlbumButton } from '../../../AlbumForms';

/** One album: its name, publishing, what's in it, and adding more from the event's photos. */
export default async function AlbumTab({ params }: { params: Promise<{ id: string; albumId: string }> }) {
  const { id, albumId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(albumId)) notFound();
  const { ctx, event } = await loadManage(id);
  const { albums, uploads, membership } = await withCtx(ctx, async (tx) => ({
    albums: await listAlbums(tx, id),
    uploads: await tx<UploadRow[]>`
      SELECT ${tx.unsafe(GALLERY_SQL_COLUMNS)} FROM events.uploads u
       WHERE u.event_id = ${id} AND u.status = 'ready' ORDER BY u.created_at DESC`,
    membership: await albumMembership(tx, id),
  }));
  const album = albums.find((a) => a.id === albumId);
  if (!album) notFound();
  const all = (await toGallery(uploads, ctx, { originals: true })).map((g) => ({ ...g, albums: membership.get(g.id) ?? [] }));
  const inside = all.filter((g) => g.albums.includes(albumId));
  const outside = all.filter((g) => !g.albums.includes(albumId) && !g.hidden);
  const list = albums.map((a) => ({ id: a.id, title: a.title, published: a.published_at !== null }));
  const moderation = { eventId: id, action: moderateUpload, bulkAction: moderateUploads };
  const base = { eventId: id, list, approveInto, fileInto: fileIntoAlbum, create: createAlbum };
  const link = `${albumUrl(event.slug)}/a/${album.slug}`;
  const qr = album.published_at ? await qrSvg(link) : null;

  return (
    <div className="space-y-6">
      <Link href={`/events/${id}/albums`} className="text-sm text-stone-500 hover:underline">← All albums</Link>
      <section id="publishing" className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{album.title}</h2>
            <p className="text-sm text-stone-600">
              {countLabel(album.photos, album.videos)} ·{' '}
              {album.published_at
                ? <>Published{album.audience === 'public' ? ' for anyone with the link' : ''}: listed under “View albums” on the event’s page. <Link className="text-brand underline" href={`/album/${event.slug}/a/${album.slug}`}>View it</Link></>
                : 'A draft: only co-hosts and editors see it until you publish it.'}
            </p>
          </div>
          <form action={publishAlbum}>
            <input type="hidden" hidden name="event_id" value={id} />
            <input type="hidden" hidden name="album_id" value={album.id} />
            <input type="hidden" hidden name="publish" value={album.published_at ? '' : 'on'} />
            <button className={album.published_at ? 'btn-secondary' : 'btn bg-green-700 hover:bg-green-800'}>{album.published_at ? 'Unpublish' : 'Publish album'}</button>
          </form>
        </div>
        <AlbumAudienceForm eventId={id} albumId={album.id} audience={album.audience} eventAudience={eventAudienceLabel(event)} />
        {qr && (
          <div className="space-y-3 rounded-xl bg-stone-50 p-3">
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="text-sm text-stone-600">The album’s own link{album.audience === 'public' ? ': anyone can open it, no code needed.' : ', for whoever can see the event.'} Scan it, or copy it into a text.</p>
            </div>
            <CopyText text={link} />
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Name and description</h2>
        <AlbumSettingsForm eventId={id} album={album} />
        <DeleteAlbumButton eventId={id} albumId={album.id} title={album.title} then={`/events/${id}/albums`} />
      </section>

      <section id="in-album" className="card space-y-3">
        <h2 className="text-lg font-semibold">In this album ({inside.length})</h2>
        <p className="text-sm text-stone-600">Open one to make it the album’s cover or take it out (it stays on the event). Waiting ones show to guests once they’re approved.</p>
        <Gallery
          items={inside}
          moderation={moderation}
          albums={{ ...base, current: { id: album.id, title: album.title, setCover: setAlbumCover } }}
          commentsSlug={event.slug}
          downloadUrl={`/album/${event.slug}/api/download`}
          empty="Nothing in it yet: add some from below."
        />
      </section>

      <section id="add-photos" className="card space-y-3">
        <h2 className="text-lg font-semibold">Add photos</h2>
        <p className="text-sm text-stone-600">The event’s other photos and videos. Tap <b>Select</b>, pick the ones you want, then <b>Add to “{album.title}”</b>. Waiting ones show in the album once they’re approved.</p>
        <Gallery items={outside} albums={{ ...base, target: { id: album.id, title: album.title } }} empty="Every photo is already in this album." />
      </section>
    </div>
  );
}
