import { logActivity } from '@/lib/events/activity';
import { withCtx } from '@/lib/events/db';
import { readPhotoMeta } from '@/lib/events/exif';
import { albumOr404, json, sameOrigin } from '@/lib/events/api';
import { MAX_PREVIEW_BYTES, MAX_UPLOAD_BYTES } from '@/lib/events/limits';
import { completeParts, missingParts } from '@/lib/events/parts';
import { cleanOverlay, isPlain } from '@/lib/events/overlay';
import { completeMultipart, deleteObject, listParts, objectSize, partUploadUrls, uploadUrl } from '@/lib/storage';
import { writableUntil } from '@/lib/events/review';
import { queueReviewNotice } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Everything after step 1 of an upload, for the uploader only:
//   status   what's already stored (to resume after an interruption)
//   url      fresh URL for a single-PUT upload (retries)
//   parts    URLs for the given multipart part numbers
//   preview  fresh URL for the preview image
//   complete confirm the bytes landed, then make the upload visible
//   decorate save a frame/filter/caption manifest (for a day after upload);
//            for photos, returns a URL to replace the gallery copy
interface Body {
  action?: string;
  parts?: number[];
  overlay?: unknown;
}

interface Row {
  status: string;
  kind: string;
  content_type: string;
  original_key: string;
  preview_key: string | null;
  multipart_id: string | null;
  size_bytes: string;
  mine: boolean;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Not found' }, 404);
  const album = await albumOr404(slug);
  if (album instanceof Response) return album;
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;

  // RLS shows uploaders their own uploads (and managers everything).
  const [u] = await withCtx(album.ctx, (tx) => tx<Row[]>`
    SELECT status, kind, content_type, original_key, preview_key, multipart_id, size_bytes,
           (uploader_user_id IS NOT NULL AND uploader_user_id IS NOT DISTINCT FROM ${album.ctx.userId}::uuid)
             OR (uploader_guest_id IS NOT NULL AND uploader_guest_id IS NOT DISTINCT FROM ${album.ctx.guest?.id ?? null}::uuid) AS mine
      FROM events.uploads WHERE id = ${id} AND event_id = ${album.event.id}`);
  if (!u || !u.mine) return json({ error: 'Not found' }, 404);
  const declared = Number(u.size_bytes);

  if (body.action === 'decorate') {
    const overlay = cleanOverlay(body.overlay);
    if (body.overlay != null && !overlay) return json({ error: 'Unknown frame or filter.' }, 400);
    const manifest = overlay && !isPlain(overlay) ? overlay : null;
    const [r] = await withCtx(album.ctx, (tx) => tx<{ ok: boolean }[]>`
      SELECT events.set_overlay(${id}, ${manifest ? tx.json(manifest as never) : null}, ${manifest?.caption ?? ''}) AS ok`);
    if (!r?.ok) return json({ error: 'The hosts have already added this to the album, so it can’t be changed now.' }, 403);
    await logActivity({
      eventId: album.event.id, action: 'upload.decorate', userId: album.isMember ? album.user!.id : null,
      guestId: album.isMember ? null : (album.guest?.id ?? null), uploadId: id, actorName: album.uploaderName, detail: { overlay: manifest },
    });
    return json({ ok: true, previewUrl: u.kind === 'photo' && u.preview_key ? await uploadUrl(u.preview_key, 'image/jpeg') : null });
  }

  if (u.status !== 'pending') return json({ ok: true, complete: true });

  // Every link handed out keeps the upload unapprovable until it expires.
  if (body.action === 'url' || body.action === 'parts' || body.action === 'preview') {
    await withCtx(album.ctx, (tx) => tx`
      UPDATE events.uploads SET writable_until = greatest(writable_until, ${writableUntil()})
       WHERE id = ${id} AND status = 'pending'`);
  }

  switch (body.action) {
    case 'status': {
      if (u.multipart_id) {
        const stored = await listParts(u.original_key, u.multipart_id);
        return json({ mode: 'multipart', stored: completeParts(declared, stored).map((p) => p.n), missing: missingParts(declared, stored) });
      }
      return json({ mode: 'single', uploaded: (await objectSize(u.original_key)) === declared });
    }
    case 'url':
      if (u.multipart_id) return json({ error: 'Use parts' }, 400);
      return json({ uploadUrl: await uploadUrl(u.original_key, u.content_type) });
    case 'parts': {
      if (!u.multipart_id) return json({ error: 'Not a multipart upload' }, 400);
      const wanted = (body.parts ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10_000).slice(0, 50);
      return json({ urls: await partUploadUrls(u.original_key, u.multipart_id, wanted) });
    }
    case 'preview':
      return json({ previewUrl: u.preview_key ? await uploadUrl(u.preview_key, 'image/jpeg') : null });
    case 'complete':
      break;
    default:
      return json({ error: 'Unknown action' }, 400);
  }

  // One completion at a time per upload: a resumed page and the one it
  // replaced (or a retry) can both say "complete", and two at once would
  // glue the parts together twice. The second waits, then finds it done.
  const done = await withCtx(album.ctx, async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`upload:${id}`}, 0))`;
    const [now] = await tx<{ status: string; multipart_id: string | null; preview_key: string | null }[]>`
      SELECT status, multipart_id, preview_key FROM events.uploads WHERE id = ${id} AND event_id = ${album.event.id}`;
    if (!now || now.status !== 'pending') return { finished: true } as const;
    if (now.multipart_id) {
      const stored = await listParts(u.original_key, now.multipart_id);
      const missing = missingParts(declared, stored);
      if (missing.length) return { response: json({ error: 'Some parts didn’t arrive. Resuming…', missing }, 409) };
      await completeMultipart(u.original_key, now.multipart_id, completeParts(declared, stored));
    }
    const size = await objectSize(u.original_key);
    if (size === null) return { response: json({ error: 'The file didn’t arrive. Try again.' }, 409) };
    if (size > MAX_UPLOAD_BYTES || size === 0) {
      await deleteObject(u.original_key);
      return { response: json({ error: 'That file is too large.' }, 400) };
    }
    let previewKey = now.preview_key;
    if (previewKey) {
      const p = await objectSize(previewKey);
      if (p === null || p > MAX_PREVIEW_BYTES) {
        if (p !== null) await deleteObject(previewKey);
        previewKey = null;
      }
    }
    await tx`
      UPDATE events.uploads SET status = 'ready', completed_at = now(), size_bytes = ${size},
                                preview_key = ${previewKey}, multipart_id = NULL
       WHERE id = ${id} AND status = 'pending'`;
    return { size, previewKey };
  });
  if ('finished' in done) return json({ ok: true, complete: true });
  if ('response' in done) return done.response!;
  const { size, previewKey } = done;
  await logActivity({
    eventId: album.event.id,
    action: 'upload.complete',
    userId: album.isMember ? album.user!.id : null,
    guestId: album.isMember ? null : (album.guest?.id ?? null),
    uploadId: id,
    actorName: album.uploaderName,
    detail: {
      size,
      resumable: Boolean(u.multipart_id),
      preview: Boolean(previewKey),
      photo: u.kind === 'photo' ? await readPhotoMeta(u.original_key) : null,
    },
  });
  // Hosts' and helpers' own uploads need no review; anyone else's waits for them.
  if (!album.canManage) queueReviewNotice(album.event.id);
  return json({ ok: true, complete: true });
}
