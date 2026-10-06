import { Gallery } from '@/components/events/Gallery';
import { albumMembership, listAlbums } from '@/lib/events/albums';
import { withCtx } from '@/lib/events/db';
import { eventActivity, namesByDevice, uploadDetails } from '@/lib/events/forensics';
import { loadManage } from '@/lib/events/manage';
import { GALLERY_SQL_COLUMNS, toGallery, type UploadRow } from '@/lib/events/queries';
import { formatBytes } from '@/lib/events/rules';
import { approveInto, createAlbum, fileIntoAlbum } from '../../../album-actions';
import { approveAllReady, moderateUpload, moderateUploads } from '../../../actions';

/**
 * Photos: what's waiting for an OK first, then every photo and video (the
 * master grid). In the photo view, a waiting one is approved and posted
 * into albums in one go; an approved one is added to or taken out of albums.
 */
export default async function PhotosTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event } = await loadManage(id);
  const { uploads, activity, albums, membership } = await withCtx(ctx, async (tx) => ({
    uploads: await tx<UploadRow[]>`
      SELECT ${tx.unsafe(GALLERY_SQL_COLUMNS)} FROM events.uploads u
       WHERE u.event_id = ${id} AND u.status = 'ready' ORDER BY u.created_at DESC`,
    activity: await eventActivity(tx, id),
    albums: await listAlbums(tx, id),
    membership: await albumMembership(tx, id),
  }));
  const deviceNames = namesByDevice(activity);
  const gallery = (await toGallery(uploads, ctx, { originals: true }))
    .map((g) => ({ ...g, details: uploadDetails(activity, g.id, deviceNames), albums: membership.get(g.id) ?? [] }));
  // Not yet approved: nobody but the uploader and the hosts sees these.
  const queue = gallery.filter((g) => g.pending && !g.hidden);
  const readyNow = queue.filter((g) => !g.reviewableAt).length;
  const totalBytes = uploads.reduce((n, u) => n + Number(u.size_bytes), 0);
  const tools = {
    eventId: id,
    list: albums.map((a) => ({ id: a.id, title: a.title, published: a.published_at !== null })),
    approveInto, fileInto: fileIntoAlbum, create: createAlbum,
  };
  const moderation = { eventId: id, action: moderateUpload, bulkAction: moderateUploads };

  return (
    <div className="space-y-6">
      {queue.length > 0 && (
        <section id="review" className="card space-y-4 border-amber-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Waiting for your OK ({queue.length})</h2>
              <p className="text-sm text-stone-600">Only the person who added each one, and you hosts, can see these. Open one to approve it and pick the albums it goes in, or hide or delete anything that shouldn’t be there.</p>
            </div>
            {readyNow > 0 && (
              <form action={approveAllReady}>
                <input type="hidden" hidden name="event_id" value={id} />
                <button className="btn bg-green-700 hover:bg-green-800">Approve {readyNow === queue.length ? 'all' : readyNow} {readyNow === 1 ? 'photo' : 'photos'}</button>
              </form>
            )}
          </div>
          {readyNow < queue.length && (
            <p className="text-sm text-amber-800">Some are still finishing on the guest’s phone and can be approved in a few minutes.</p>
          )}
          <Gallery items={queue} reviewQueue downloadUrl={`/album/${event.slug}/api/download`} moderation={moderation} albums={tools} commentsSlug={event.slug} empty="Nothing waiting." />
        </section>
      )}

      <section id="photos" className="card space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Photos &amp; videos</h2>
          <p className="text-sm text-stone-600">{uploads.length} items · {formatBytes(totalBytes)}</p>
        </div>
        <p className="text-sm text-stone-600">Every photo and video on the event, waiting ones included. Open one to approve it, star it, hide it, or put it in albums; use Select to do many at once.</p>
        <Gallery
          items={gallery}
          downloadUrl={`/album/${event.slug}/api/download`}
          commentsSlug={event.slug}
          moderation={moderation}
          albums={tools}
          empty="Nothing yet. Share a code or QR, or add some yourself from the album page."
        />
        <details className="text-sm text-stone-600">
          <summary className="cursor-pointer">Downloading everything</summary>
          <p className="mt-2">Each photo has a “Download original” link, and Select → All → Download makes a zip. For the whole album at once, use the bucket’s credentials from Railway with <code>rclone</code> or <code>aws s3 sync</code> on the folder <code>events/{id}/</code>; see docs/RAILWAY.md.</p>
        </details>
      </section>
    </div>
  );
}
