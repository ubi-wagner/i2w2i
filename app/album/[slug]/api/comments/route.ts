import { logActivity } from '@/lib/events/activity';
import { albumOr404, json, sameOrigin } from '@/lib/events/api';
import { withCtx } from '@/lib/events/db';
import { rateLimit } from '@/lib/rate-limit';
import { parseClient } from '@/lib/request-meta';

export const dynamic = 'force-dynamic';

export interface CommentView {
  id: number;
  body: string;
  author: string;
  created_at: string;
  mine: boolean;
  can_delete: boolean;
}

// Comments on one photo or video. Row-level security (migration 005) decides
// who can read, post and remove; this route only shapes the data.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const album = await albumOr404((await params).slug);
  if (album instanceof Response) return album;
  const upload = new URL(req.url).searchParams.get('upload') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(upload)) return json({ error: 'Bad request' }, 400);
  const rows = await withCtx(album.ctx, (tx) => tx<CommentView[]>`
    SELECT c.id::int AS id, c.body, c.author_name AS author, c.created_at,
           (c.user_id IS NOT NULL AND c.user_id IS NOT DISTINCT FROM ${album.ctx.userId}::uuid)
             OR (c.guest_id IS NOT NULL AND c.guest_id IS NOT DISTINCT FROM ${album.ctx.guest?.id ?? null}::uuid) AS mine,
           false AS can_delete
      FROM events.comments c
     WHERE c.event_id = ${album.event.id} AND c.upload_id = ${upload} AND c.deleted_at IS NULL
     ORDER BY c.id LIMIT 500`);
  return json({ comments: rows.map((r) => ({ ...r, can_delete: r.mine || album.canManage })), canPost: canPost(album) });
}

function canPost(album: Exclude<Awaited<ReturnType<typeof albumOr404>>, Response>) {
  return album.canView && Boolean(album.user || album.guest);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const album = await albumOr404((await params).slug);
  if (album instanceof Response) return album;
  const body = ((await req.json().catch(() => null)) ?? {}) as { action?: string; id?: number; upload?: string; body?: string; client?: unknown };

  if (body.action === 'delete') {
    const id = Number(body.id);
    const rows = await withCtx(album.ctx, (tx) => tx`
      UPDATE events.comments SET deleted_at = now()
       WHERE id = ${id} AND event_id = ${album.event.id} AND deleted_at IS NULL RETURNING upload_id`);
    if (!rows.length) return json({ error: 'You can’t remove that comment.' }, 403);
    await logActivity({
      eventId: album.event.id, action: 'comment.delete', userId: album.user?.id ?? null, guestId: album.guest?.id ?? null,
      uploadId: rows[0]!.upload_id as string, actorName: album.uploaderName ?? album.user?.display_name ?? null, detail: { comment_id: id },
    });
    return json({ ok: true });
  }

  if (!canPost(album)) return json({ error: 'Join the album to comment.' }, 403);
  const upload = String(body.upload ?? '');
  const text = String(body.body ?? '').trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/.test(upload) || !text) return json({ error: 'Write something first.' }, 400);
  const who = album.user ? `u:${album.user.id}` : `g:${album.guest!.id}`;
  if (!rateLimit(`comment:${who}`, 20, 60_000)) return json({ error: 'Slow down a little.' }, 429);
  // Signed-in people comment as themselves; guests under the name they gave.
  const asUser = Boolean(album.user && (album.isMember || !album.guest));
  const author = asUser ? album.user!.display_name : album.guest!.display_name;
  try {
    const [c] = await withCtx(album.ctx, (tx) => tx<{ id: number }[]>`
      INSERT INTO events.comments (event_id, upload_id, user_id, guest_id, author_name, body)
      VALUES (${album.event.id}, ${upload}, ${asUser ? album.user!.id : null}, ${asUser ? null : album.guest!.id}, ${author}, ${text})
      RETURNING id::int AS id`);
    await logActivity({
      eventId: album.event.id, action: 'comment.post', userId: asUser ? album.user!.id : null, guestId: asUser ? null : album.guest!.id,
      uploadId: upload, actorName: author, client: parseClient(body.client), detail: { comment_id: c!.id, length: text.length },
    });
    return json({ ok: true, id: c!.id });
  } catch (err) {
    if (/row-level security/.test(String((err as Error).message))) return json({ error: 'You can’t comment on that.' }, 403);
    throw err;
  }
}
