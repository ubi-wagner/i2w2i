import { logActivity } from '@/lib/events/activity';
import { withCtx } from '@/lib/events/db';
import { readPhotoMeta } from '@/lib/events/exif';
import { albumOr404, json, sameOrigin } from '@/lib/events/api';
import { MAX_PREVIEW_BYTES, MAX_UPLOAD_BYTES } from '@/lib/events/limits';
import { deleteObject, objectSize, uploadUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// action=url: fresh presigned URLs for a retry.
// action=complete: confirm the bytes landed, then make the upload visible.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Not found' }, 404);
  const album = await albumOr404(slug);
  if (album instanceof Response) return album;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;

  // RLS shows uploaders their own uploads (and managers everything).
  const [u] = await withCtx(album.ctx, (tx) => tx<{ status: string; kind: string; content_type: string; original_key: string; preview_key: string | null; mine: boolean }[]>`
    SELECT status, kind, content_type, original_key, preview_key,
           (uploader_user_id IS NOT DISTINCT FROM ${album.ctx.userId}::uuid AND uploader_user_id IS NOT NULL)
             OR (uploader_guest_id IS NOT DISTINCT FROM ${album.ctx.guest?.id ?? null}::uuid AND uploader_guest_id IS NOT NULL) AS mine
      FROM events.uploads WHERE id = ${id} AND event_id = ${album.event.id}`);
  if (!u || !u.mine) return json({ error: 'Not found' }, 404);
  if (u.status !== 'pending') return json({ ok: true });

  if (body?.action === 'url') {
    return json({
      uploadUrl: await uploadUrl(u.original_key, u.content_type),
      previewUrl: u.preview_key ? await uploadUrl(u.preview_key, 'image/jpeg') : null,
    });
  }

  if (body?.action !== 'complete') return json({ error: 'Unknown action' }, 400);
  const size = await objectSize(u.original_key);
  if (size === null) return json({ error: 'The file didn’t arrive. Try again.' }, 409);
  if (size > MAX_UPLOAD_BYTES || size === 0) {
    await deleteObject(u.original_key);
    return json({ error: 'That file is too large.' }, 400);
  }
  let previewKey = u.preview_key;
  if (previewKey) {
    const p = await objectSize(previewKey);
    if (p === null || p > MAX_PREVIEW_BYTES) {
      if (p !== null) await deleteObject(previewKey);
      previewKey = null;
    }
  }
  await withCtx(album.ctx, (tx) => tx`
    UPDATE events.uploads SET status = 'ready', completed_at = now(), size_bytes = ${size}, preview_key = ${previewKey}
     WHERE id = ${id} AND status = 'pending'`);
  await logActivity({
    eventId: album.event.id,
    action: 'upload.complete',
    userId: album.isMember ? album.user!.id : null,
    guestId: album.isMember ? null : (album.guest?.id ?? null),
    uploadId: id,
    actorName: album.uploaderName,
    detail: { size, preview: Boolean(previewKey), photo: u.kind === 'photo' ? await readPhotoMeta(u.original_key) : null },
  });
  return json({ ok: true });
}
