import 'server-only';
import { cookies } from 'next/headers';
import { sql } from '../db';
import { getCurrentUser, type CurrentUser } from '../auth/session';
import { hashToken, newToken } from '../auth/tokens';
import { ANON, type EventCtx } from './db';
import type { ThemeId } from './themes';

// Guest sessions: code/QR holders get a cookie scoped to one album's path,
// so it is only ever sent to /album/<slug>/...

export const GUEST_COOKIE = 'i2w2i_guest';
const GUEST_DAYS = 60;

export interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  starts_on: Date | null;
  location: string;
  status: 'draft' | 'published';
  audience: 'public' | 'family' | 'invitees';
  theme: ThemeId;
  /** Invitation wording only (see PUBLIC_PAGE_KEYS); clean with cleanPage. */
  page_public: unknown;
}

export interface Guest {
  id: string;
  display_name: string;
  can_upload: boolean;
  can_view: boolean;
}

/** Facts any visitor may know about an album URL (title, date), or null. */
export async function publicEvent(slug: string): Promise<PublicEvent | null> {
  const [e] = await sql<PublicEvent[]>`SELECT * FROM events.public_event(${slug})`;
  return e ?? null;
}

export function userCtx(user: CurrentUser | null): EventCtx {
  return user ? { userId: user.id, admin: user.platform_role === 'admin', guest: null } : ANON;
}

export async function currentGuest(eventId: string): Promise<Guest | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const [g] = await sql<{ guest_id: string; display_name: string; can_upload: boolean; can_view: boolean }[]>`
    SELECT * FROM events.resolve_guest(${hashToken(token)}, ${eventId})`;
  return g ? { id: g.guest_id, display_name: g.display_name, can_upload: g.can_upload, can_view: g.can_view } : null;
}

export async function startGuestSession(slug: string, accessCodeId: string, via: 'code' | 'qr', name: string): Promise<string | null> {
  const token = newToken();
  const [row] = await sql<{ id: string | null }[]>`
    SELECT events.create_guest(${accessCodeId}, ${via}, ${name}, ${hashToken(token)}) AS id`;
  if (!row?.id) return null;
  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/album/${slug}`,
    maxAge: GUEST_DAYS * 86_400,
  });
  return row.id;
}

export async function endGuestSession(slug: string): Promise<void> {
  (await cookies()).set(GUEST_COOKIE, '', { path: `/album/${slug}`, maxAge: 0 });
}

/**
 * Everything an album request needs to know about the visitor: the
 * signed-in user (if any), their guest session for this event (if any),
 * and the combined row-level-security context.
 */
export async function albumVisitor(event: PublicEvent) {
  const user = await getCurrentUser();
  const guest = await currentGuest(event.id);
  const ctx: EventCtx = {
    ...userCtx(user),
    guest: guest ? { id: guest.id, eventId: event.id, canUpload: guest.can_upload, canView: guest.can_view } : null,
  };
  return { user, guest, ctx };
}
