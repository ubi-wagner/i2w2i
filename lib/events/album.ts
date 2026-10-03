import 'server-only';
import { withCtx } from './db';
import type { MemberRole } from './queries';
import { albumVisitor, publicEvent, type PublicEvent } from './session';

export interface Album {
  event: PublicEvent;
  user: Awaited<ReturnType<typeof albumVisitor>>['user'];
  guest: Awaited<ReturnType<typeof albumVisitor>>['guest'];
  ctx: Awaited<ReturnType<typeof albumVisitor>>['ctx'];
  role: MemberRole | null;
  /** On the event as a platform account (or the admin). */
  isMember: boolean;
  canManage: boolean;
  canUpload: boolean;
  canView: boolean;
  chat: boolean;
  description: string;
  uploaderName: string | null;
}

/** Who is looking at /album/<slug> and what they may do there. Null if no such album. */
export async function loadAlbum(slug: string): Promise<Album | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return null;
  const event = await publicEvent(slug);
  if (!event) return null;
  const { user, guest, ctx } = await albumVisitor(event);
  const facts = await withCtx(ctx, async (tx) => {
    const [r] = await tx<{ role: MemberRole | null; can_view: boolean; chat_enabled: boolean | null; description: string | null }[]>`
      SELECT events.member_role(${event.id}) AS role,
             events.can_view_album(${event.id}) AS can_view,
             (SELECT chat_enabled FROM events.events WHERE id = ${event.id}) AS chat_enabled,
             (SELECT description FROM events.events WHERE id = ${event.id}) AS description`;
    return r!;
  });
  const isMember = ctx.admin || facts.role !== null;
  return {
    event,
    user,
    guest,
    ctx,
    role: facts.role,
    isMember,
    canManage: ctx.admin || facts.role === 'owner' || facts.role === 'curator',
    canUpload: isMember || Boolean(guest?.can_upload),
    canView: facts.can_view,
    chat: isMember && Boolean(facts.chat_enabled),
    description: facts.description ?? '',
    uploaderName: isMember ? user!.display_name : (guest?.display_name ?? null),
  };
}
