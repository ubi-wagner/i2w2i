import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { requireApp } from '../apps';
import { withCtx } from './db';
import { cleanPage } from './page';
import { canManage, canOwn, eventForCtx, type EventRow } from './queries';
import { userCtx } from './session';

/** What hosts call each role on an event (the database calls them owner, curator, invitee). */
export const ROLE_LABEL = { owner: 'Co-host', curator: 'Editor', invitee: 'Viewer' } as const;
export type EventRole = keyof typeof ROLE_LABEL;
export const ROLE_HINT: Record<EventRole, string> = {
  owner: 'Runs everything: people, guest codes and QR, gifts, the page, photos and albums.',
  curator: 'Approves, hides and stars photos, makes and publishes albums, and edits the page.',
  invitee: 'Sees the album, adds photos (a co-host or editor approves them) and joins the chat.',
};

/**
 * The event being managed and who's asking, for every tab of the manage
 * pages (cached per request, so the layout and the tab share one lookup).
 * Not a host or editor: off to the album.
 */
export const loadManage = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user } = await requireApp('events');
  const ctx = userCtx(user);
  const found = await eventForCtx(ctx, id);
  if (!found) notFound();
  if (!canManage(ctx, found.role)) redirect(`/album/${found.event.slug}`);
  return { user, ctx, event: found.event, role: found.role, owner: canOwn(ctx, found.role) };
});

/** Photos waiting for a host's OK (not hidden), for the tab badge and the overview. */
export const waitingCount = cache(async (id: string) => {
  const { ctx } = await loadManage(id);
  const [r] = await withCtx(ctx, (tx) => tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM events.uploads
     WHERE event_id = ${id} AND status = 'ready' AND approved_at IS NULL AND NOT hidden`);
  return r?.n ?? 0;
});

/** What the page editor starts from: the page as it's saved now. */
export function pageInitial(event: EventRow) {
  return {
    title: event.title,
    startsOn: event.starts_on ? event.starts_on.toISOString().slice(0, 10) : '',
    location: event.location,
    description: event.description,
    theme: event.theme,
    giftNote: event.gift_note,
    page: cleanPage(event.page),
  };
}
