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
}

const AUDIENCE = { invitees: 'Invitees', family: 'Family', public: 'Public' } as const;

/** The events someone is on, newest first; the whole card opens the album. */
export async function EventCards({ ctx, empty, limit }: { ctx: EventCtx; empty: React.ReactNode; limit?: number }) {
  const events = await withCtx(ctx, (tx) => tx<Row[]>`
    SELECT e.id, e.slug, e.title, e.starts_on, e.status, e.audience, events.member_role(e.id) AS role,
           (SELECT count(*)::int FROM events.uploads u WHERE u.event_id = e.id AND u.status = 'ready' AND NOT u.hidden) AS uploads
      FROM events.events e
     WHERE events.is_member(e.id)
     ORDER BY coalesce(e.starts_on, e.created_at::date) DESC
     LIMIT ${limit ?? 500}`);
  if (!events.length) return <>{empty}</>;
  return (
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
            {manages && (
              <Link href={`/events/${e.id}`} className="relative z-10 inline-block text-sm font-medium text-brand hover:underline">Manage</Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
