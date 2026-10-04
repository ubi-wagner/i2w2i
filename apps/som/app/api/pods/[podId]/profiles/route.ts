import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { podRole } from '@/lib/server/pods';

export const dynamic = 'force-dynamic';

// Profiles: each member's likes and limits, encrypted with the pod key. Everyone
// in the pod reads them all; each person writes only their own.

export async function GET(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  if (!isUuid(podId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const profiles = await sql`SELECT account_id, body_enc, rev, updated_at FROM som.profiles WHERE pod_id = ${podId}`;
  return json({ profiles });
}

/** Saves your own profile, unless it was saved from another phone meanwhile (rev 0: the first save). */
export async function PUT(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  if (!isUuid(podId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const b = await body<{ bodyEnc?: unknown; rev?: unknown }>(req);
  if (!isCipher(b?.bodyEnc, 'j1', 300_000) || !Number.isInteger(b?.rev) || (b!.rev as number) < 0) return bad('That doesn’t look like a profile.');
  const bodyEnc = b!.bodyEnc as string;
  const rev = b!.rev as number;
  const [row] = rev === 0
    ? await sql<{ rev: number }[]>`INSERT INTO som.profiles (pod_id, account_id, body_enc) VALUES (${podId}, ${me.id}, ${bodyEnc})
                                   ON CONFLICT (pod_id, account_id) DO NOTHING RETURNING rev`
    : await sql<{ rev: number }[]>`UPDATE som.profiles SET body_enc = ${bodyEnc}, rev = rev + 1, updated_at = now()
                                    WHERE pod_id = ${podId} AND account_id = ${me.id} AND rev = ${rev} RETURNING rev`;
  if (!row) return bad('Your profile was saved from another phone. Showing that version.', 409);
  return json({ rev: row.rev });
}
