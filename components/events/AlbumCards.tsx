import Link from 'next/link';
import type { AlbumCard } from '@/lib/events/albums';

/** The event's published albums as cards: a cover, the name and how many photos. */
export function AlbumCards({ slug, albums, current }: { slug: string; albums: AlbumCard[]; current?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {albums.map((a) => (
        <li key={a.id}>
          <Link
            href={`/album/${slug}/a/${a.slug}`}
            aria-current={a.slug === current ? 'page' : undefined}
            className={`group block overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:border-brand ${a.slug === current ? 'border-brand ring-2 ring-brand/30' : 'border-stone-200'}`}
          >
            <span className="block aspect-[4/3] overflow-hidden bg-stone-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.cover ? <img src={a.cover} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" /> : null}
            </span>
            <span className="block px-3 py-2">
              <span className="block font-display text-lg font-semibold leading-tight text-stone-900">{a.title}</span>
              <span className="block text-xs text-stone-500">{a.photos} {a.photos === 1 ? 'photo' : 'photos'}{a.published ? '' : ' · draft'}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
