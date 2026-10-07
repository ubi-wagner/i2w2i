import 'server-only';
import { viewUrl } from '../storage';
import type { Tx } from './db';

/** An album inside an event, as RLS lets the requester see it. */
export interface AlbumRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
  published_at: Date | null;
  /** private: whoever can see the event; public: anyone with the album's link (migration 012). */
  audience: AlbumAudience;
  cover_upload_id: string | null;
  /** Photos and videos the requester can see in it (the uploads policy decides). */
  photos: number;
  videos: number;
  /** Gallery copy of the cover (the chosen one, else the first photo in it), if the requester can see one. */
  cover_key: string | null;
}

export type AlbumAudience = 'private' | 'public';

export interface AlbumCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  published: boolean;
  public: boolean;
  photos: number;
  videos: number;
  cover: string | null;
}

/**
 * The event's albums in their order, with counts and covers. RLS limits
 * both the albums (published ones only, for viewers) and what's counted in
 * them (approved, not hidden), so this is safe for any requester.
 */
export function listAlbums(tx: Tx, eventId: string, opts: { publishedOnly?: boolean } = {}) {
  return tx<AlbumRow[]>`
    SELECT a.id, a.slug, a.title, a.description, a.sort_order, a.published_at, a.audience, a.cover_upload_id,
           (SELECT count(*)::int FROM events.album_items i JOIN events.uploads u ON u.id = i.upload_id
             WHERE i.album_id = a.id AND u.status = 'ready' AND NOT u.hidden AND u.kind = 'photo') AS photos,
           (SELECT count(*)::int FROM events.album_items i JOIN events.uploads u ON u.id = i.upload_id
             WHERE i.album_id = a.id AND u.status = 'ready' AND NOT u.hidden AND u.kind = 'video') AS videos,
           (SELECT coalesce(u.preview_key, CASE WHEN u.kind = 'photo' THEN u.original_key END)
              FROM events.uploads u
             WHERE u.status = 'ready' AND NOT u.hidden
               AND u.id = coalesce(
                     (SELECT c.id FROM events.uploads c JOIN events.album_items ci ON ci.upload_id = c.id AND ci.album_id = a.id
                       WHERE c.id = a.cover_upload_id AND c.status = 'ready' AND NOT c.hidden),
                     (SELECT i.upload_id FROM events.album_items i JOIN events.uploads f ON f.id = i.upload_id
                       WHERE i.album_id = a.id AND f.status = 'ready' AND NOT f.hidden AND (f.kind = 'photo' OR f.preview_key IS NOT NULL)
                       ORDER BY f.featured DESC, f.created_at LIMIT 1))) AS cover_key
      FROM events.albums a
     WHERE a.event_id = ${eventId} ${opts.publishedOnly ? tx`AND a.published_at IS NOT NULL` : tx``}
     ORDER BY a.sort_order, a.created_at`;
}

export async function toAlbumCards(rows: AlbumRow[]): Promise<AlbumCard[]> {
  return Promise.all(rows.map(async (a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    description: a.description,
    published: a.published_at !== null,
    public: a.audience === 'public',
    photos: a.photos,
    videos: a.videos,
    cover: a.cover_key ? await viewUrl(a.cover_key) : null,
  })));
}

/** Which albums each upload is in (for hosts filing photos), as upload id → album ids. */
export async function albumMembership(tx: Tx, eventId: string): Promise<Map<string, string[]>> {
  const rows = await tx<{ upload_id: string; album_id: string }[]>`
    SELECT upload_id, album_id FROM events.album_items WHERE event_id = ${eventId}`;
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.upload_id, [...(out.get(r.upload_id) ?? []), r.album_id]);
  return out;
}

/** A web address for an album, unique within its event: "ceremony", "ceremony-2"… */
export async function freeAlbumSlug(tx: Tx, eventId: string, base: string): Promise<string> {
  const root = (base || 'album').slice(0, 50).replace(/-+$/, '') || 'album';
  const taken = new Set((await tx<{ slug: string }[]>`
    SELECT slug FROM events.albums WHERE event_id = ${eventId} AND (slug = ${root} OR slug LIKE ${`${root}-%`})`).map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

/** "3 photos", "2 photos · 1 video", "No photos yet". */
export function countLabel(photos: number, videos: number): string {
  const p = `${photos} ${photos === 1 ? 'photo' : 'photos'}`;
  const v = `${videos} ${videos === 1 ? 'video' : 'videos'}`;
  if (!photos && !videos) return 'No photos yet';
  return videos ? (photos ? `${p} · ${v}` : v) : p;
}
