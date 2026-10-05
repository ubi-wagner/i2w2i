import { bad, guard, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { mediaFor, partCount, TAG_BYTES } from '@/lib/server/media';
import { nameOf, others } from '@/lib/server/pods';
import { notifySoon } from '@/lib/server/push';
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
  // One completion at a time per upload: a retry and the request it
  // replaced can both arrive, and two at once would glue the parts together
  // twice. The second waits, then finds it done.
  const done = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`media:${id}`}, 0))`;
    const [now] = await tx<{ status: string; upload_id: string | null }[]>`SELECT status, upload_id FROM som.media WHERE id = ${id}`;
    if (!now) return bad('Not found', 404);
    if (now.status === 'ready') return json({ ok: true });
    if (now.upload_id) {
      const total = partCount(bytes, m.chunk_bytes);
      const parts = await listParts(m.object_key, now.upload_id);
      const full = m.chunk_bytes + TAG_BYTES;
      const sizesOk = parts.length === total && parts.every((p, i) => p.n === i + 1 && p.size === (i === total - 1 ? bytes - full * (total - 1) : full));
      if (!sizesOk) return json({ error: 'Some parts haven’t arrived yet.', have: parts.map((p) => p.n) }, 409);
      await completeMultipart(m.object_key, now.upload_id, parts);
    }
    if ((await objectSize(m.object_key)) !== bytes) return json({ error: 'The upload didn’t arrive whole. Try again.' }, 409);
    if (m.thumb_key && (await objectSize(m.thumb_key)) !== m.thumb_bytes) return json({ error: 'The thumbnail didn’t arrive. Try again.' }, 409);
    await tx`UPDATE som.media SET status = 'ready', upload_id = NULL WHERE id = ${id}`;
    return 'ready' as const;
  });
  if (done !== 'ready') return done;
  // Sent on its own (in the notes): tell the others. A task's photos are
  // told when the task is sent for review, all at once.
  const [row] = await sql<{ task_id: string | null; switched: boolean }[]>`
    SELECT m.task_id, s.switched FROM som.media m JOIN som.scenes s ON s.id = m.scene_id WHERE m.id = ${id}`;
  if (row && !row.task_id) {
    notifySoon(await others({ pod_id: m.pod_id, switched: row.switched }, me.id), {
      title: 'S-O-M', body: `${await nameOf(me.id)} sent you something.`, url: `/scene/${m.scene_id}#notes`, tag: `note-${m.scene_id}`,
    });
  }
  return json({ ok: true });
}
