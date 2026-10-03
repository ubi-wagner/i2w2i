import 'server-only';
import { viewUrl } from '../storage';
import { withCtx, type EventCtx } from './db';

export type MemberRole = 'owner' | 'curator' | 'invitee';

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  starts_on: Date | null;
  location: string;
  description: string;
  status: 'draft' | 'published';
  audience: 'public' | 'family' | 'invitees';
  chat_enabled: boolean;
  created_by: string;
  created_at: Date;
}

export interface UploadRow {
  id: string;
  event_id: string;
  uploader_user_id: string | null;
  uploader_guest_id: string | null;
  uploader_name: string;
  kind: 'photo' | 'video';
  content_type: string;
  filename: string;
  size_bytes: string; // bigint
  original_key: string;
  preview_key: string | null;
  status: 'pending' | 'ready';
  hidden: boolean;
  featured: boolean;
  caption: string;
  created_at: Date;
}

export interface GalleryItem {
  id: string;
  kind: 'photo' | 'video';
  uploaderName: string;
  createdAt: string;
  hidden: boolean;
  featured: boolean;
  /** Shown in the grid: the on-phone preview, else the original. */
  src: string;
  /** Original, only for people who may download it. */
  originalUrl: string | null;
  filename: string;
  sizeBytes: number;
  mine: boolean;
  /** Managers only: who/what/where for this upload. */
  details?: { label: string; value: string; href?: string }[];
}

/** The event plus the requester's role on it, as RLS allows them to see it. */
export async function eventForCtx(ctx: EventCtx, id: string): Promise<{ event: EventRow; role: MemberRole | null } | null> {
  return withCtx(ctx, async (tx) => {
    const [event] = await tx<EventRow[]>`SELECT * FROM events.events WHERE id = ${id}`;
    if (!event) return null;
    const [m] = await tx<{ role: MemberRole }[]>`SELECT events.member_role(${id}) AS role`;
    return { event, role: m?.role ?? null };
  });
}

export function canManage(ctx: EventCtx, role: MemberRole | null) {
  return ctx.admin || role === 'owner' || role === 'curator';
}

export function canOwn(ctx: EventCtx, role: MemberRole | null) {
  return ctx.admin || role === 'owner';
}

/** Turns rows RLS let through into gallery items with short-lived URLs. */
export async function toGallery(rows: UploadRow[], ctx: EventCtx, opts: { originals: boolean }): Promise<GalleryItem[]> {
  return Promise.all(
    rows.map(async (u) => {
      const mine = (ctx.userId !== null && u.uploader_user_id === ctx.userId) || (ctx.guest !== null && u.uploader_guest_id === ctx.guest.id);
      const showOriginal = opts.originals || mine;
      return {
        id: u.id,
        kind: u.kind,
        uploaderName: u.uploader_name,
        createdAt: u.created_at.toISOString(),
        hidden: u.hidden,
        featured: u.featured,
        src: await viewUrl(u.preview_key ?? u.original_key),
        originalUrl: showOriginal ? await viewUrl(u.original_key, u.filename || undefined) : null,
        filename: u.filename,
        sizeBytes: Number(u.size_bytes),
        mine,
      };
    }),
  );
}
