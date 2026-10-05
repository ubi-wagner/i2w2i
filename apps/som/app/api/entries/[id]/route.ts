import { bad, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { abortMultipart, deleteObject } from '@/lib/server/storage';
import { canDelete } from '@/lib/rules';

export const dynamic = 'force-dynamic';

/** Your own words, deleted any time, with anything you sent along with them. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { id } = await params;
  const [e] = isUuid(id) ? await sql<{ author_id: string }[]>`SELECT author_id FROM som.entries WHERE id = ${id}` : [];
  if (!e) return bad('Not found', 404);
  if (!canDelete(e.author_id, me.id)) return bad('Only the person who wrote it can delete it.', 403);
  // Finished uploads and any that never finished (their half-sent parts too).
  const media = await sql<{ id: string; object_key: string; thumb_key: string | null; upload_id: string | null }[]>`
    SELECT id, object_key, thumb_key, upload_id FROM som.media WHERE entry_id = ${id} AND uploader_id = ${me.id}`;
  for (const m of media) {
    if (m.upload_id) await abortMultipart(m.object_key, m.upload_id).catch(() => {});
    await deleteObject(m.object_key).catch(() => {});
    if (m.thumb_key) await deleteObject(m.thumb_key).catch(() => {});
    await sql`DELETE FROM som.media WHERE id = ${m.id}`;
  }
  await sql`DELETE FROM som.entries WHERE id = ${id}`;
  return json({ ok: true });
}
