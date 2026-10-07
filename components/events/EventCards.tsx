import Link from 'next/link';
import { withCtx, type EventCtx } from '@/lib/events/db';
import { viewUrl } from '@/lib/storage';

interface Row {
  id: string;
  slug: string;
  title: string;
  starts_on: Date | null;
  status: string;
  audience: string;
  role: string | null;
  uploads: number;
  to_review: number;
  theme: 'classic' | 'woodland' | 'garden';
  /** The newest approved photo the viewer can see (starred first), for the card's cover. */
  cover_key: string | null;
}

/** "Sam & Riley" → "S & R"; "Grandma's 90th" → "G9". For the banner. */
function monogram(title: string): string {
  const parts = title.split('&').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts.map((p) => p[0]!.toUpperCase()).join(' & ');
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

// A banner in the event's look when there's no photo yet.
const BANNER = {
  woodland: 'bg-[radial-gradient(ellipse_at_top,#21402f,#0c1b13)] text-[#d4b06a]',
  garden: 'bg-[radial-gradient(ellipse_at_top,#fdfcf8,#e8ecde)] text-[#4f6040]',
  classic: 'bg-gradient-to-br from-violet-100 to-violet-200 text-violet-800',
} as const;

const AUDIENCE = { invitees: 'Guests', family: 'Family', public: 'Public' } as const;
const YOU = { owner: 'You’re a co-host', curator: 'You’re an editor', invitee: 'You’re a viewer' } as const;

/**
 * The events someone is on, newest first; the whole card opens the album.
 * `shared` lists instead the albums published to the whole family (or
 * everyone) that they aren't on.
 */
export async function EventCards({ ctx, empty, limit, shared = false, heading, newTile = false }: {
  ctx: EventCtx; empty: React.ReactNode; limit?: number; shared?: boolean; heading?: React.ReactNode;
  /** Creators: a "Plan your own event" tile beside the events they're on. */
  newTile?: boolean;
}) {
  const events = await withCtx(ctx, (tx) => tx<Row[]>`
    SELECT e.id, e.slug, e.title, e.starts_on, e.status, e.audience, e.theme, events.member_role(e.id) AS role,
           (SELECT count(*)::int FROM events.uploads u WHERE u.event_id = e.id AND u.status = 'ready' AND NOT u.hidden) AS uploads,
           (SELECT count(*)::int FROM events.uploads u WHERE u.event_id = e.id AND u.status = 'ready' AND NOT u.hidden AND u.approved_at IS NULL) AS to_review,
           (SELECT coalesce(u.preview_key, u.original_key) FROM events.uploads u
             WHERE u.event_id = e.id AND u.status = 'ready' AND NOT u.hidden AND u.approved_at IS NOT NULL
               AND (u.preview_key IS NOT NULL OR u.kind = 'photo')
             ORDER BY u.featured DESC, u.created_at DESC LIMIT 1) AS cover_key
      FROM events.events e
     WHERE ${shared
       ? tx`NOT events.is_member(e.id) AND e.status = 'published' AND e.audience IN ('family', 'public') AND events.can_view_album(e.id)`
       : tx`events.is_member(e.id)`}
     ORDER BY coalesce(e.starts_on, e.created_at::date) DESC
     LIMIT ${limit ?? 500}`);
  if (!events.length) return <>{empty}</>;
  const covers = await Promise.all(events.map((e) => (e.cover_key ? viewUrl(e.cover_key) : null)));
  return (
    <section className="space-y-3">
    {heading}
    <ul className="grid gap-4 sm:grid-cols-2">
      {events.map((e, i) => {
        const manages = ctx.admin || e.role === 'owner' || e.role === 'curator';
        const cover = covers[i];
        return (
          <li key={e.id} className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-brand/60 hover:shadow-md">
            <div className={`relative aspect-[16/7] overflow-hidden ${cover ? 'bg-stone-200' : BANNER[e.theme] ?? BANNER.classic}`}>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              ) : (
                <span className="flex h-full items-center justify-center px-4 text-center font-display text-5xl font-semibold" aria-hidden="true">{monogram(e.title)}</span>
              )}
              {manages && (
                <span className={`badge absolute right-3 top-3 shadow-sm ${e.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-white/90 text-stone-700'}`}>
                  {e.status === 'published' ? `Published · ${AUDIENCE[e.audience as keyof typeof AUDIENCE]}` : 'Draft'}
                </span>
              )}
            </div>
            <div className="space-y-1.5 p-5">
              <h3 className="text-lg font-semibold leading-snug">
                <Link href={`/album/${e.slug}`} className="after:absolute after:inset-0">{e.title}</Link>
              </h3>
              <p className="text-sm text-stone-600">
                {e.starts_on ? e.starts_on.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'medium' }) : 'No date'} · {e.uploads} {e.uploads === 1 ? 'photo or video' : 'photos & videos'}
              </p>
              <p className="text-sm text-stone-500">
                {shared ? 'Shared with the family' : e.role ? YOU[e.role as keyof typeof YOU] : 'You’re the admin'}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-sm font-medium text-brand-dark" aria-hidden="true">Open album →</span>
                {manages && (
                  <>
                  <Link href={`/events/${e.id}`} className="btn-secondary btn-sm relative z-10 ml-auto">Manage</Link>
                  {e.to_review > 0 && (
                    <Link href={`/events/${e.id}/photos`} className="badge relative z-10 basis-full justify-center bg-amber-100 px-2.5 py-1 text-amber-900 hover:bg-amber-200 sm:basis-auto">
                      {e.to_review} waiting for your OK
                    </Link>
                  )}
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
      {newTile && (
        <li>
          <Link href="/events/new" className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white/60 p-6 text-center transition hover:border-brand hover:bg-brand-light/40">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-2xl text-white" aria-hidden="true">+</span>
            <span className="text-lg font-semibold">Plan your own event</span>
            <span className="max-w-xs text-sm text-stone-600">A page for guests, QR cards for the tables and a shared album you run.</span>
          </Link>
        </li>
      )}
    </ul>
    </section>
  );
}
