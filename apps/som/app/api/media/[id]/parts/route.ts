import { bad, body, guard, isUuid, json } from '@/lib/server/api';
import { mediaFor, partCount } from '@/lib/server/media';
import { listParts, partUploadUrls, uploadUrl } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

/** Fresh upload links (they expire), and which parts the bucket already has, to resume. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const m = isUuid(id) ? await mediaFor(me.id, id) : null;
  if (!m || m.uploader_id !== me.id || m.status !== 'uploading') return bad('Not found', 404);
  const b = await body<{ parts?: unknown }>(req);
  const total = partCount(Number(m.bytes), m.chunk_bytes);
  if (!m.upload_id) return json({ put: await uploadUrl(m.object_key, 'application/octet-stream'), have: [] });
  const want = Array.isArray(b?.parts) ? (b!.parts as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= total).slice(0, 1000) : [];
  const have = (await listParts(m.object_key, m.upload_id)).map((p) => p.n);
  return json({ parts: await partUploadUrls(m.object_key, m.upload_id, want), have });
}
