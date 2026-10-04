import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { MAX_MEDIA_BYTES, partCount } from '@/lib/server/media';
import { sceneFor } from '@/lib/server/pods';
import { partUploadUrls, startMultipart, uploadUrl } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';
const TYPE = 'application/octet-stream';
const isNonce = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v);

// A photo, video or voice note, already encrypted on the phone. Big files
// upload in parts (one encrypted chunk each), straight to the bucket.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const found = isUuid(id) ? await sceneFor(me.id, id) : null;
  if (!found) return bad('Not found', 404);
  if (found.scene.status === 'closed') return bad('This scene is closed.', 409);
  const b = await body<{ id?: unknown; taskId?: unknown; entryId?: unknown; bytes?: unknown; chunkBytes?: unknown; fileKeyEnc?: unknown; nonce?: unknown; metaEnc?: unknown; thumb?: { bytes?: unknown; nonce?: unknown } | null }>(req);
  if (!b || !isUuid(b.id) || !isCipher(b.fileKeyEnc, 'k1', 400) || !isNonce(b.nonce) || !isCipher(b.metaEnc, 'j1', 20_000)) return bad('That doesn’t look like an upload.');
  const bytes = Number(b.bytes);
  const chunk = Number(b.chunkBytes);
  if (!Number.isInteger(bytes) || bytes < 17 || bytes > MAX_MEDIA_BYTES) return bad('That file is too big.', 413);
  if (!Number.isInteger(chunk) || chunk < 1024 || chunk > 64 * 1024 * 1024) return bad('That doesn’t look like an upload.');
  const parts = partCount(bytes, chunk);
  if (parts > 10_000) return bad('That file is too big.', 413);
  const thumb = b.thumb && Number.isInteger(b.thumb.bytes) && (b.thumb.bytes as number) > 16 && (b.thumb.bytes as number) <= 2_000_000 && isNonce(b.thumb.nonce) ? { bytes: b.thumb.bytes as number, nonce: b.thumb.nonce as string } : null;
  for (const [field, val] of [['task', b.taskId], ['entry', b.entryId]] as const) {
    if (val == null) continue;
    if (!isUuid(val)) return bad(`Unknown ${field}.`);
    const [ok] = field === 'task'
      ? await sql`SELECT 1 FROM som.tasks WHERE id = ${val} AND scene_id = ${id}`
      : await sql`SELECT 1 FROM som.entries WHERE id = ${val} AND scene_id = ${id} AND author_id = ${me.id}`;
    if (!ok) return bad(`Unknown ${field}.`);
  }

  const key = `s/${id}/${b.id}`;
  const thumbKey = thumb ? `${key}.t` : null;
  const uploadId = parts > 1 ? await startMultipart(key, TYPE) : null;
  await sql`INSERT INTO som.media (id, scene_id, task_id, entry_id, uploader_id, object_key, thumb_key, bytes, thumb_bytes, chunk_bytes, file_key_enc, nonce, thumb_nonce, meta_enc, upload_id)
            VALUES (${b.id}, ${id}, ${(b.taskId as string) ?? null}, ${(b.entryId as string) ?? null}, ${me.id}, ${key}, ${thumbKey}, ${bytes}, ${thumb?.bytes ?? null}, ${chunk},
                    ${b.fileKeyEnc as string}, ${b.nonce}, ${thumb?.nonce ?? null}, ${b.metaEnc as string}, ${uploadId})`;
  return json({
    put: uploadId ? undefined : await uploadUrl(key, TYPE),
    parts: uploadId ? await partUploadUrls(key, uploadId, Array.from({ length: parts }, (_, i) => i + 1)) : undefined,
    thumbPut: thumbKey ? await uploadUrl(thumbKey, TYPE) : undefined,
  });
}
