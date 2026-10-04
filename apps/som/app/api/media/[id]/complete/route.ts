import { bad, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { mediaFor, partCount, TAG_BYTES } from '@/lib/server/media';
import { completeMultipart, listParts, objectSize } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

/** Finishes an upload once the bucket has every byte the phone said it would send. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const m = isUuid(id) ? await mediaFor(me.id, id) : null;
  if (!m || m.uploader_id !== me.id) return bad('Not found', 404);
  if (m.status === 'ready') return json({ ok: true });
  const bytes = Number(m.bytes);
  if (m.upload_id) {
    const total = partCount(bytes, m.chunk_bytes);
    const parts = await listParts(m.object_key, m.upload_id);
    const full = m.chunk_bytes + TAG_BYTES;
    const sizesOk = parts.length === total && parts.every((p, i) => p.n === i + 1 && p.size === (i === total - 1 ? bytes - full * (total - 1) : full));
    if (!sizesOk) return json({ error: 'Some parts haven’t arrived yet.', have: parts.map((p) => p.n) }, 409);
    await completeMultipart(m.object_key, m.upload_id, parts);
  }
  if ((await objectSize(m.object_key)) !== bytes) return json({ error: 'The upload didn’t arrive whole. Try again.' }, 409);
  if (m.thumb_key && (await objectSize(m.thumb_key)) !== m.thumb_bytes) return json({ error: 'The thumbnail didn’t arrive. Try again.' }, 409);
  await sql`UPDATE som.media SET status = 'ready', upload_id = NULL WHERE id = ${id}`;
  return json({ ok: true });
}
