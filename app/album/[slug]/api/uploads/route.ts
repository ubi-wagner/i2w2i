import { randomUUID } from 'node:crypto';
import { logActivity } from '@/lib/events/activity';
import { withCtx } from '@/lib/events/db';
import { parseClient } from '@/lib/request-meta';
import { albumOr404, json, sameOrigin } from '@/lib/events/api';
import { fileExtension, uploadKind, uploadProblem } from '@/lib/events/rules';
import { rateLimit } from '@/lib/rate-limit';
import { MULTIPART_THRESHOLD, PART_SIZE, partCount } from '@/lib/events/limits';
import { startMultipart, uploadUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Step 1 of an upload: record it and hand back presigned URLs. The phone
// then PUTs the file straight to the bucket (step 2) and calls
// /uploads/<id> with action=complete (step 3).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const album = await albumOr404((await params).slug);
  if (album instanceof Response) return album;
  if (!album.canUpload || !album.uploaderName) return json({ error: 'You can’t add photos to this album.' }, 403);

  const body = (await req.json().catch(() => null)) as { name?: string; type?: string; size?: number; preview?: boolean; lastModified?: number; client?: unknown } | null;
  const type = String(body?.type ?? '');
  const size = Number(body?.size);
  const problem = uploadProblem({ type, size });
  if (problem) return json({ error: problem }, 400);
  const who = album.isMember ? `u:${album.user!.id}` : `g:${album.guest!.id}`;
  if (!rateLimit(`upload:${who}`, 600, 60 * 60_000)) return json({ error: 'That’s a lot of uploads at once. Try again in a bit.' }, 429);

  const id = randomUUID();
  const kind = uploadKind(type)!;
  const filename = String(body?.name ?? '').slice(0, 200);
  const base = `events/${album.event.id}/${id}`;
  const originalKey = `${base}/original.${fileExtension(filename, type)}`;
  // Photos: a downscaled copy. Videos: a still for the gallery tile.
  const previewKey = body?.preview ? `${base}/preview.jpg` : null;
  // Big files (mostly videos) go up in parts so an interruption resumes.
  const multipartId = size >= MULTIPART_THRESHOLD ? await startMultipart(originalKey, type) : null;

  await withCtx(album.ctx, (tx) => tx`
    INSERT INTO events.uploads (id, event_id, uploader_user_id, uploader_guest_id, uploader_name, kind,
                                content_type, filename, size_bytes, original_key, preview_key, multipart_id)
    VALUES (${id}, ${album.event.id}, ${album.isMember ? album.user!.id : null}, ${album.isMember ? null : album.guest!.id},
            ${album.uploaderName}, ${kind}, ${type}, ${filename}, ${size}, ${originalKey}, ${previewKey}, ${multipartId})`);

  await logActivity({
    eventId: album.event.id,
    action: 'upload.start',
    userId: album.isMember ? album.user!.id : null,
    guestId: album.isMember ? null : album.guest!.id,
    uploadId: id,
    actorName: album.uploaderName,
    client: parseClient(body?.client),
    detail: {
      filename,
      type,
      size,
      kind,
      // When the phone says the file was last changed (usually when it was taken or saved).
      lastModified: Number.isFinite(body?.lastModified) ? new Date(body!.lastModified!).toISOString() : null,
    },
  });

  return json({
    id,
    mode: multipartId ? 'multipart' : 'single',
    partSize: PART_SIZE,
    partCount: multipartId ? partCount(size) : 1,
    uploadUrl: multipartId ? null : await uploadUrl(originalKey, type),
    previewUrl: previewKey ? await uploadUrl(previewKey, 'image/jpeg') : null,
  });
}
