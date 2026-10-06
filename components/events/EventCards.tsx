import Link from 'next/link';
import { withCtx, type EventCtx } from '@/lib/events/db';

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
}

const AUDIENCE = { invitees: 'Guests', family: 'Family', public: 'Public' } as const;
const YOU = { owner: 'You’re a co-host', curator: 'You’re an editor', invitee: 'You’re a viewer' } as const;

/**
 * The events someone is on, newest first; the whole card opens the album.
 * `shared` lists instead the albums published to the whole family (or
 * everyone) that they aren't on.
 */
export async function EventCards({ ctx, empty, limit, shared = false, heading }: { ctx: EventCtx; empty: React.ReactNode; limit?: number; shared?: boolean; heading?: React.ReactNode }) {
  const events = await withCtx(ctx, (tx) => tx<Row[]>`
    SELECT e.id, e.slug, e.title, e.starts_on, e.status, e.audience, events.member_role(e.id) AS role,
           (SELECT count(*)::int FROM events.uploads u WHERE u.event_id = e.id AND u.status = 'ready' AND NOT u.hidden) AS uploads,
           (SELECT count(*)::int FROM events.uploads u WHERE u.event_id = e.id AND u.status = 'ready' AND NOT u.hidden AND u.approved_at IS NULL) AS to_review
      FROM events.events e
     WHERE ${shared
       ? tx`NOT events.is_member(e.id) AND e.status = 'published' AND e.audience IN ('family', 'public') AND events.can_view_album(e.id)`
       : tx`events.is_member(e.id)`}
     ORDER BY coalesce(e.starts_on, e.created_at::date) DESC
     LIMIT ${limit ?? 500}`);
  if (!events.length) return <>{empty}</>;
  return (
    <section className="space-y-3">
    {heading}
    <ul className="grid gap-4 sm:grid-cols-2">
      {events.map((e) => {
        const manages = ctx.admin || e.role === 'owner' || e.role === 'curator';
        return (
          <li key={e.id} className="card relative space-y-2 transition hover:border-brand hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold">
                <Link href={`/album/${e.slug}`} className="after:absolute after:inset-0">{e.title}</Link>
              </h3>
              {manages && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${e.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-600'}`}>
                  {e.status === 'published' ? `Published · ${AUDIENCE[e.audience as keyof typeof AUDIENCE]}` : 'Draft'}
                </span>
              )}
            </div>
            <p className="text-sm text-stone-600">
              {e.starts_on ? e.starts_on.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'medium' }) : 'No date'} · {e.uploads} photos &amp; videos
            </p>
            <p className="text-sm text-stone-500">
              {shared ? 'Shared with the family' : e.role ? YOU[e.role as keyof typeof YOU] : 'You’re the admin'}
            </p>
            {manages && (
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/events/${e.id}`} className="relative z-10 inline-block text-sm font-medium text-brand hover:underline">Manage</Link>
                {e.to_review > 0 && (
                  <Link href={`/events/${e.id}/photos`} className="relative z-10 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-200">
                    {e.to_review} waiting for your OK
                  </Link>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
    </section>
  );
}
