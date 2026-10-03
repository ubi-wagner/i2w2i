import { logActivity } from '@/lib/events/activity';
import { withCtx } from '@/lib/events/db';
import { parseClient } from '@/lib/request-meta';
import { albumOr404, json, sameOrigin } from '@/lib/events/api';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export interface ChatMessage {
  id: number;
  body: string;
  created_at: string;
  name: string;
  mine: boolean;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const album = await albumOr404((await params).slug);
  if (album instanceof Response) return album;
  if (!album.chat) return json({ error: 'Chat is for people on this event.' }, 403);
  const after = Number(new URL(req.url).searchParams.get('after') ?? 0) || 0;
  const rows = await withCtx(album.ctx, (tx) => tx<ChatMessage[]>`
    SELECT m.id::int AS id, m.body, m.created_at, u.display_name AS name, m.user_id = ${album.user!.id} AS mine
      FROM events.messages m JOIN core.users u ON u.id = m.user_id
     WHERE m.event_id = ${album.event.id} AND m.deleted_at IS NULL AND m.id > ${after}
     ORDER BY m.id DESC LIMIT 200`);
  return json({ messages: rows.reverse() });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  const album = await albumOr404((await params).slug);
  if (album instanceof Response) return album;
  if (!album.chat) return json({ error: 'Chat is for people on this event.' }, 403);
  const payload = (await req.json().catch(() => null)) as { body?: string; client?: unknown } | null;
  const body = String(payload?.body ?? '').trim().slice(0, 2000);
  if (!body) return json({ error: 'Empty message' }, 400);
  if (!rateLimit(`chat:${album.user!.id}`, 30, 60_000)) return json({ error: 'Slow down a little.' }, 429);
  const [m] = await withCtx(album.ctx, (tx) => tx<{ id: number }[]>`
    INSERT INTO events.messages (event_id, user_id, body) VALUES (${album.event.id}, ${album.user!.id}, ${body})
    RETURNING id::int AS id`);
  await logActivity({
    eventId: album.event.id,
    action: 'chat.post',
    userId: album.user!.id,
    actorName: album.user!.display_name,
    client: parseClient(payload?.client),
    detail: { message_id: m!.id, length: body.length },
  });
  return json({ ok: true });
}
