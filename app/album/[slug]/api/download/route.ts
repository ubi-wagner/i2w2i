import { once } from 'node:events';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { logActivity } from '@/lib/events/activity';
import { albumOr404, json, sameOrigin } from '@/lib/events/api';
import { withCtx } from '@/lib/events/db';
import { zipEntryNames } from '@/lib/events/rules';
import { readStream } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_ITEMS = 500;

interface Row {
  id: string;
  kind: 'photo' | 'video';
  filename: string;
  uploader_name: string;
  original_key: string;
  preview_key: string | null;
  mine: boolean;
  created_at: Date;
}

// Selected photos and videos as one zip, streamed: entries are fetched from
// storage one at a time, so memory stays flat for any size. Viewers get the
// gallery copies of photos (metadata stripped); managers and the uploader
// get originals. Row-level security decides which items are included.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const album = await albumOr404((await params).slug);
  if (album instanceof Response) return album;
  const form = await req.formData();
  const ids = form.getAll('id').map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)).slice(0, MAX_ITEMS);
  if (!ids.length) return json({ error: 'Nothing selected' }, 400);

  const rows = await withCtx(album.ctx, (tx) => tx<Row[]>`
    SELECT id, kind, filename, uploader_name, original_key, preview_key, created_at,
           (uploader_user_id IS NOT NULL AND uploader_user_id IS NOT DISTINCT FROM ${album.ctx.userId}::uuid)
             OR (uploader_guest_id IS NOT NULL AND uploader_guest_id IS NOT DISTINCT FROM ${album.ctx.guest?.id ?? null}::uuid) AS mine
      FROM events.uploads
     WHERE event_id = ${album.event.id} AND id = ANY(${ids}::uuid[]) AND status = 'ready'
       AND (NOT hidden OR ${album.canManage})
     ORDER BY created_at`);
  if (!rows.length) return json({ error: 'Nothing to download' }, 404);

  const entries = rows.map((r) => {
    const original = album.canManage || r.mine || r.kind === 'video' || !r.preview_key;
    return { row: r, key: original ? r.original_key : r.preview_key!, original };
  });
  const names = zipEntryNames(entries.map((e) => ({ uploader: e.row.uploader_name, filename: e.row.filename, key: e.key, original: e.original })));

  await logActivity({
    eventId: album.event.id,
    action: 'album.download',
    userId: album.user?.id ?? null,
    guestId: album.guest?.id ?? null,
    actorName: album.uploaderName ?? album.user?.display_name ?? album.guest?.display_name ?? null,
    detail: { count: rows.length, originals: entries.filter((e) => e.original).length },
  });

  const zip = new ZipArchive({ store: true });
  // Feed entries one at a time after the response starts streaming.
  (async () => {
    try {
      for (const [i, e] of entries.entries()) {
        zip.append(await readStream(e.key), { name: names[i]!, date: e.row.created_at });
        await once(zip, 'entry');
      }
      await zip.finalize();
    } catch (err) {
      console.error('[download] zip failed:', (err as Error).message);
      zip.abort();
    }
  })();

  const slug = album.event.slug;
  return new Response(Readable.toWeb(zip) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}-${rows.length}-items.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
