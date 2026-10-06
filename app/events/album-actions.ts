'use server';

import { revalidatePath } from 'next/cache';
import { requireApp } from '@/lib/apps';
import { audit } from '@/lib/audit';
import { logActivity } from '@/lib/events/activity';
import { freeAlbumSlug } from '@/lib/events/albums';
import { withCtx } from '@/lib/events/db';
import { slugify } from '@/lib/events/rules';
import { userCtx } from '@/lib/events/session';

// Albums inside an event, and filing photos into them. Hosts and editors
// only: the policies in migration 011 refuse anyone else, whatever is asked.

export interface AlbumState { error?: string; message?: string; id?: string }

const UUID = /^[0-9a-f-]{36}$/;
const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isRlsError = (err: unknown) => /row-level security|permission denied/i.test(String((err as Error)?.message));

async function who() {
  const { user } = await requireApp('events');
  return { user, ctx: userCtx(user) };
}

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`, 'layout');
  revalidatePath('/album/[slug]', 'layout');
}

/** A new album (a draft until published), named by the host; its address comes from the name. */
export async function createAlbum(input: { eventId: string; title: string; description?: string }): Promise<AlbumState> {
  const { user, ctx } = await who();
  const eventId = clip(input?.eventId, 40);
  const title = clip(input?.title, 80);
  if (!UUID.test(eventId)) return { error: 'Something went wrong. Reload and try again.' };
  if (!title) return { error: 'Give the album a name, like “Ceremony”.' };
  try {
    const id = await withCtx(ctx, async (tx) => {
      const slug = await freeAlbumSlug(tx, eventId, slugify(title));
      const [{ n }] = await tx<{ n: number }[]>`SELECT coalesce(max(sort_order), 0) + 1 AS n FROM events.albums WHERE event_id = ${eventId}`;
      const [a] = await tx<{ id: string }[]>`
        INSERT INTO events.albums (event_id, slug, title, description, sort_order, created_by)
        VALUES (${eventId}, ${slug}, ${title}, ${clip(input.description, 1000)}, ${n}, ${user.id}) RETURNING id`;
      return a!.id;
    });
    await audit(user.id, 'events.album.create', eventId, { album: id, title });
    await logActivity({ eventId, action: 'album.create', userId: user.id, actorName: user.display_name, detail: { album: id, title } });
    refresh(eventId);
    return { id, message: `Made “${title}”. Add photos to it, then publish it.` };
  } catch (err) {
    if (isRlsError(err)) return { error: 'Only the event’s co-hosts and editors make albums.' };
    throw err;
  }
}

/** The album's name and the words under it (its web address stays, so shared links keep working). */
export async function updateAlbum(_prev: AlbumState, form: FormData): Promise<AlbumState> {
  const { user, ctx } = await who();
  const eventId = clip(form.get('event_id'), 40);
  const albumId = clip(form.get('album_id'), 40);
  const title = clip(form.get('title'), 80);
  if (!UUID.test(eventId) || !UUID.test(albumId)) return { error: 'Something went wrong. Reload and try again.' };
  if (!title) return { error: 'The album needs a name.' };
  const rows = await withCtx(ctx, (tx) => tx`
    UPDATE events.albums SET title = ${title}, description = ${clip(form.get('description'), 1000)}
     WHERE id = ${albumId} AND event_id = ${eventId} RETURNING 1`);
  if (!rows.length) return { error: 'Only the event’s co-hosts and editors change albums.' };
  await audit(user.id, 'events.album.update', eventId, { album: albumId });
  refresh(eventId);
  return { message: 'Saved.' };
}

/** Published (listed under “View albums” for everyone who can see the event), or back to a draft. */
export async function publishAlbum(form: FormData): Promise<void> {
  const { user, ctx } = await who();
  const eventId = clip(form.get('event_id'), 40);
  const albumId = clip(form.get('album_id'), 40);
  const on = form.get('publish') === 'on';
  if (!UUID.test(eventId) || !UUID.test(albumId)) return;
  await withCtx(ctx, (tx) => tx`
    UPDATE events.albums SET published_at = ${on ? tx`coalesce(published_at, now())` : null}
     WHERE id = ${albumId} AND event_id = ${eventId}`);
  await audit(user.id, on ? 'events.album.publish' : 'events.album.unpublish', eventId, { album: albumId });
  await logActivity({ eventId, action: on ? 'album.publish' : 'album.unpublish', userId: user.id, actorName: user.display_name, detail: { album: albumId } });
  refresh(eventId);
}

/**
 * Who can open a published album: whoever can see the event (private), or
 * anyone with its link (public). Only hosts and editors choose (migration 012).
 */
export async function setAlbumAudience(_prev: AlbumState, form: FormData): Promise<AlbumState> {
  const { user, ctx } = await who();
  const eventId = clip(form.get('event_id'), 40);
  const albumId = clip(form.get('album_id'), 40);
  const audience = form.get('audience') === 'public' ? 'public' : 'private';
  if (!UUID.test(eventId) || !UUID.test(albumId)) return { error: 'Something went wrong. Reload and try again.' };
  const rows = await withCtx(ctx, (tx) => tx`
    UPDATE events.albums SET audience = ${audience} WHERE id = ${albumId} AND event_id = ${eventId} RETURNING 1`);
  if (!rows.length) return { error: 'Only the event’s co-hosts and editors change albums.' };
  await audit(user.id, 'events.album.audience', eventId, { album: albumId, audience });
  await logActivity({ eventId, action: 'album.audience', userId: user.id, actorName: user.display_name, detail: { album: albumId, audience } });
  refresh(eventId);
  return { message: audience === 'public' ? 'Saved: anyone with the link can see it.' : 'Saved: only people who can see the event.' };
}

/** One place up or down in the list guests see. */
export async function moveAlbum(form: FormData): Promise<void> {
  const { ctx } = await who();
  const eventId = clip(form.get('event_id'), 40);
  const albumId = clip(form.get('album_id'), 40);
  const by = form.get('dir') === 'up' ? -1 : 1;
  if (!UUID.test(eventId) || !UUID.test(albumId)) return;
  await withCtx(ctx, async (tx) => {
    const list = await tx<{ id: string }[]>`SELECT id FROM events.albums WHERE event_id = ${eventId} ORDER BY sort_order, created_at`;
    const i = list.findIndex((a) => a.id === albumId);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    for (const [n, a] of list.entries()) await tx`UPDATE events.albums SET sort_order = ${n + 1} WHERE id = ${a.id}`;
  });
  refresh(eventId);
}

/** The album goes; its photos stay in the event's main grid (and any other album they're in). */
export async function deleteAlbum(form: FormData): Promise<void> {
  const { user, ctx } = await who();
  const eventId = clip(form.get('event_id'), 40);
  const albumId = clip(form.get('album_id'), 40);
  if (!UUID.test(eventId) || !UUID.test(albumId)) return;
  await withCtx(ctx, (tx) => tx`DELETE FROM events.albums WHERE id = ${albumId} AND event_id = ${eventId}`);
  await audit(user.id, 'events.album.delete', eventId, { album: albumId });
  await logActivity({ eventId, action: 'album.delete', userId: user.id, actorName: user.display_name, detail: { album: albumId } });
  refresh(eventId);
}

/** The photo shown for the album in “View albums”. */
export async function setAlbumCover(input: { eventId: string; albumId: string; uploadId: string }): Promise<AlbumState> {
  const { ctx } = await who();
  if (![input?.eventId, input?.albumId, input?.uploadId].every((x) => UUID.test(x))) return { error: 'Something went wrong. Reload and try again.' };
  const rows = await withCtx(ctx, (tx) => tx`
    UPDATE events.albums SET cover_upload_id = ${input.uploadId}
     WHERE id = ${input.albumId} AND event_id = ${input.eventId}
       AND EXISTS (SELECT 1 FROM events.album_items i WHERE i.album_id = ${input.albumId} AND i.upload_id = ${input.uploadId})
    RETURNING 1`);
  if (!rows.length) return { error: 'That photo isn’t in the album.' };
  refresh(input.eventId);
  return { message: 'Album cover set.' };
}

/** Puts photos into an album, or takes them out. Photos never leave the event's main grid. */
export async function fileIntoAlbum(input: { eventId: string; albumId: string; uploadIds: string[]; add: boolean }): Promise<AlbumState> {
  const { user, ctx } = await who();
  const ids = (Array.isArray(input?.uploadIds) ? input.uploadIds : []).filter((x) => UUID.test(x)).slice(0, 2000);
  if (!UUID.test(input?.eventId) || !UUID.test(input?.albumId) || !ids.length) return { error: 'Nothing to do.' };
  try {
    const n = await withCtx(ctx, async (tx) => {
      const rows = input.add
        ? await tx`INSERT INTO events.album_items (album_id, upload_id, event_id, added_by)
                   SELECT ${input.albumId}, u.id, u.event_id, ${user.id} FROM events.uploads u
                    WHERE u.id = ANY(${ids}::uuid[]) AND u.event_id = ${input.eventId}
                   ON CONFLICT DO NOTHING RETURNING 1`
        : await tx`DELETE FROM events.album_items WHERE album_id = ${input.albumId} AND upload_id = ANY(${ids}::uuid[]) RETURNING 1`;
      // A photo taken out stops being the album's cover.
      if (!input.add) await tx`UPDATE events.albums SET cover_upload_id = NULL WHERE id = ${input.albumId} AND cover_upload_id = ANY(${ids}::uuid[])`;
      return rows.length;
    });
    await logActivity({ eventId: input.eventId, action: input.add ? 'album.add' : 'album.remove', userId: user.id, actorName: user.display_name, detail: { album: input.albumId, count: n } });
    refresh(input.eventId);
    return { message: `${input.add ? 'Added' : 'Took out'} ${n} ${n === 1 ? 'item' : 'items'}.` };
  } catch (err) {
    if (isRlsError(err)) return { error: 'Only the event’s co-hosts and editors change albums.' };
    throw err;
  }
}

/**
 * The review step: approve a waiting photo and post it into the chosen
 * albums in one go. The database still refuses an approval while the
 * guest's phone could change the picture (migration 008).
 */
export async function approveInto(input: { eventId: string; uploadId: string; albumIds: string[] }): Promise<AlbumState> {
  const { user, ctx } = await who();
  const albums = (Array.isArray(input?.albumIds) ? input.albumIds : []).filter((x) => UUID.test(x)).slice(0, 50);
  if (!UUID.test(input?.eventId) || !UUID.test(input?.uploadId)) return { error: 'Something went wrong. Reload and try again.' };
  try {
    const ok = await withCtx(ctx, async (tx) => {
      const rows = await tx`
        UPDATE events.uploads SET approved_at = now(), approved_by = ${user.id}
         WHERE id = ${input.uploadId} AND event_id = ${input.eventId} AND status = 'ready' AND approved_at IS NULL
           AND (writable_until IS NULL OR writable_until < now())
        RETURNING 1`;
      if (!rows.length) return false;
      for (const a of albums) {
        await tx`INSERT INTO events.album_items (album_id, upload_id, event_id, added_by)
                 VALUES (${a}, ${input.uploadId}, ${input.eventId}, ${user.id}) ON CONFLICT DO NOTHING`;
      }
      return true;
    });
    if (!ok) return { error: 'It can’t be approved yet: the guest’s phone may still be finishing it. Try again in a few minutes.' };
  } catch (err) {
    if (isRlsError(err)) return { error: 'Only the event’s co-hosts and editors approve photos.' };
    throw err;
  }
  await audit(user.id, 'events.upload.approve', input.eventId, { upload: input.uploadId, albums });
  await logActivity({ eventId: input.eventId, action: 'upload.approve', userId: user.id, uploadId: input.uploadId, actorName: user.display_name, detail: { albums } });
  refresh(input.eventId);
  return { message: albums.length ? `Approved and posted to ${albums.length === 1 ? 'the album' : `${albums.length} albums`}.` : 'Approved.' };
}
