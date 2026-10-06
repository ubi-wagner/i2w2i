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
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">Your albums ({albums.length})</h2>
          <ol className="divide-y divide-stone-100">
            {albums.map((a, i) => (
              <li key={a.id} className="flex flex-wrap items-center gap-4 py-3">
                <Link href={`/events/${id}/albums/${a.id}`} className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.cover ? <img src={a.cover} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-stone-500">No photos</span>}
                </Link>
                <div className="min-w-0 grow">
                  <p className="font-semibold">
                    <Link href={`/events/${id}/albums/${a.id}`} className="hover:underline">{a.title}</Link>{' '}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${a.published ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-600'}`}>{a.published ? 'Published' : 'Draft'}</span>
                    {a.public && <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">Public</span>}
                  </p>
                  <p className="text-sm text-stone-600">{countLabel(a.photos, a.videos)}{a.description ? ` · ${a.description}` : ''}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                    <Link href={`/events/${id}/albums/${a.id}`} className="text-brand hover:underline">Edit &amp; add photos</Link>
                    {a.published && <Link href={`/album/${event.slug}/a/${a.slug}`} className="text-brand hover:underline">View</Link>}
                    <form action={publishAlbum}>
                      <input type="hidden" hidden name="event_id" value={id} />
                      <input type="hidden" hidden name="album_id" value={a.id} />
                      <input type="hidden" hidden name="publish" value={a.published ? '' : 'on'} />
                      <button className={a.published ? 'text-stone-600 hover:underline' : 'font-medium text-green-800 hover:underline'}>{a.published ? 'Unpublish' : 'Publish'}</button>
                    </form>
                    {(['up', 'down'] as const).map((dir) => (
                      <form key={dir} action={moveAlbum}>
                        <input type="hidden" hidden name="event_id" value={id} />
                        <input type="hidden" hidden name="album_id" value={a.id} />
                        <input type="hidden" hidden name="dir" value={dir} />
                        <button className="text-stone-500 disabled:opacity-30" disabled={dir === 'up' ? i === 0 : i === albums.length - 1} aria-label={`Move ${a.title} ${dir}`}>{dir === 'up' ? '↑' : '↓'}</button>
                      </form>
                    ))}
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
