import { bad, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { mediaFor } from '@/lib/server/media';
import { abortMultipart, deleteObject, viewUrl } from '@/lib/server/storage';
import { canDelete } from '@/lib/rules';

export const dynamic = 'force-dynamic';

/** Short-lived links to fetch the (encrypted) file and its thumbnail. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const m = isUuid(id) ? await mediaFor(me.id, id) : null;
  if (!m || m.status !== 'ready') return bad('Not found', 404);
  return json({ url: await viewUrl(m.object_key), thumbUrl: m.thumb_key ? await viewUrl(m.thumb_key) : null });
}

/** Your own uploads, deleted any time (from the bucket too). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const m = isUuid(id) ? await mediaFor(me.id, id) : null;
  if (!m) return bad('Not found', 404);
  if (!canDelete(m.uploader_id, me.id)) return bad('Only the person who sent it can delete it.', 403);
  if (m.upload_id) await abortMultipart(m.object_key, m.upload_id);
  await deleteObject(m.object_key).catch(() => {});
  if (m.thumb_key) await deleteObject(m.thumb_key).catch(() => {});
  await sql`DELETE FROM som.media WHERE id = ${id}`;
  return json({ ok: true });
}
