import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { podRole } from '@/lib/server/pods';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  if (!isUuid(podId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const b = await body<{ settingsEnc?: unknown }>(req);
  if (!isCipher(b?.settingsEnc, 'j1', 20_000)) return bad('That doesn’t look right.');
  await sql`UPDATE som.pods SET settings_enc = ${b!.settingsEnc as string} WHERE id = ${podId}`;
  return json({ ok: true });
}
