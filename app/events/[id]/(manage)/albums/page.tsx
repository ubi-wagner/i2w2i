import Link from 'next/link';
import { countLabel, listAlbums, toAlbumCards } from '@/lib/events/albums';
import { withCtx } from '@/lib/events/db';
import { loadManage } from '@/lib/events/manage';
import { moveAlbum, publishAlbum } from '../../../album-actions';
import { DeleteAlbumButton, NewAlbumForm } from '../../AlbumForms';

/**
 * Albums: named pages inside the event ("Ceremony", "Reception"). Each is a
 * draft until it's published; published ones are listed under “View albums”
 * on the event's page, in this order.
 */
export default async function AlbumsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event } = await loadManage(id);
  const albums = await toAlbumCards(await withCtx(ctx, (tx) => listAlbums(tx, id)));
  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Albums</h2>
          <p className="text-sm text-stone-600">
            Every approved photo is in the event’s main grid. Albums are named pages on top of that, like “Getting ready”, “Ceremony” or “Reception”. Post photos into them as you approve them (Photos tab), then publish each one when it’s ready: <b>private</b> for whoever can see the event, or <b>public</b> for anyone with its link. Published albums are listed under <b>View albums</b> on the event’s page, and each has a slideshow.
          </p>
        </div>
        <NewAlbumForm eventId={id} />
      </section>

      {albums.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your albums ({albums.length})</h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a, i) => (
              <li key={a.id} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <Link href={`/events/${id}/albums/${a.id}`} className="group relative block aspect-[4/3] overflow-hidden bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.cover ? <img src={a.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <span className="flex h-full items-center justify-center text-sm text-stone-500">No photos yet</span>}
                  <span className="absolute left-3 top-3 flex gap-1.5">
                    <span className={`badge shadow-sm ${a.published ? 'bg-green-100 text-green-800' : 'bg-white/90 text-stone-700'}`}>{a.published ? 'Published' : 'Draft'}</span>
                    {a.public && <span className="badge bg-sky-100 text-sky-800 shadow-sm">Public</span>}
                  </span>
                </Link>
                <div className="flex grow flex-col gap-2 p-4">
                  <div>
                    <p className="font-semibold"><Link href={`/events/${id}/albums/${a.id}`} className="hover:underline">{a.title}</Link></p>
                    <p className="text-sm text-stone-600">{countLabel(a.photos, a.videos)}{a.description ? ` · ${a.description}` : ''}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-stone-100 pt-2">
                    <Link href={`/events/${id}/albums/${a.id}`} className="btn-ghost text-brand-dark">Edit &amp; add photos</Link>
                    {a.published && <Link href={`/album/${event.slug}/a/${a.slug}`} className="btn-ghost">View</Link>}
                    <form action={publishAlbum}>
                      <input type="hidden" hidden name="event_id" value={id} />
                      <input type="hidden" hidden name="album_id" value={a.id} />
                      <input type="hidden" hidden name="publish" value={a.published ? '' : 'on'} />
                      <button className={a.published ? 'btn-ghost' : 'btn-ghost text-green-800 hover:bg-green-50'}>{a.published ? 'Unpublish' : 'Publish'}</button>
                    </form>
                    <span className="ml-auto flex items-center">
                      {(['up', 'down'] as const).map((dir) => (
                        <form key={dir} action={moveAlbum}>
                          <input type="hidden" hidden name="event_id" value={id} />
                          <input type="hidden" hidden name="album_id" value={a.id} />
                          <input type="hidden" hidden name="dir" value={dir} />
                          <button className="btn-ghost px-2" disabled={dir === 'up' ? i === 0 : i === albums.length - 1} aria-label={`Move ${a.title} ${dir}`} title={dir === 'up' ? 'Earlier in the list' : 'Later in the list'}>{dir === 'up' ? '↑' : '↓'}</button>
                        </form>
                      ))}
                    </span>
                    <DeleteAlbumButton eventId={id} albumId={a.id} title={a.title} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
