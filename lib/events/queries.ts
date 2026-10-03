import 'server-only';
import type { ThemeId } from './themes';
import { createHash } from 'node:crypto';
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
  theme: ThemeId;
  gift_note: string;
  page: unknown;
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
  overlay: Record<string, unknown> | null;
  created_at: Date;
  /** Present when the query counts comments. */
  comment_count?: number;
}

export interface GalleryItem {
  id: string;
  kind: 'photo' | 'video';
  uploaderName: string;
  createdAt: string;
  hidden: boolean;
  featured: boolean;
  /** Photos: the on-phone preview, else the original. Videos: the original (to play). */
  src: string;
  /** Videos: a still for the tile, if the phone made one. */
  poster: string | null;
  /** Original, only for people who may download it. */
  originalUrl: string | null;
  filename: string;
  sizeBytes: number;
  mine: boolean;
  caption: string;
  comments: number;
  /** Frame/filter manifest, for videos (framed at playback) and re-rendering. */
  overlay: Record<string, unknown> | null;
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
        // A decorated preview is rewritten in place; its URL changes with the decoration.
        src: await viewUrl(
          u.kind === 'video' ? u.original_key : (u.preview_key ?? u.original_key),
          undefined,
          u.kind === 'photo' && u.overlay ? createHash('sha256').update(JSON.stringify(u.overlay)).digest('hex').slice(0, 10) : undefined,
        ),
        poster: u.kind === 'video' && u.preview_key ? await viewUrl(u.preview_key) : null,
        originalUrl: showOriginal ? await viewUrl(u.original_key, u.filename || undefined) : null,
        filename: u.filename,
        sizeBytes: Number(u.size_bytes),
        mine,
        caption: u.caption,
        comments: u.comment_count ?? 0,
        overlay: u.overlay,
      };
    }),
  );
}

/** Ready uploads for a gallery, with comment counts. RLS decides which rows come back. */
export const GALLERY_SQL_COLUMNS = `u.*, (SELECT count(*)::int FROM events.comments c WHERE c.upload_id = u.id AND c.deleted_at IS NULL) AS comment_count`;
