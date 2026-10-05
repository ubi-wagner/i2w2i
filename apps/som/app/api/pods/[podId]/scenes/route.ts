import { bad, body, guard, isCipher, isUuid, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { podRole } from '@/lib/server/pods';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  if (!isUuid(podId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const scenes = await sql`
    SELECT s.id, s.status, s.plan_enc, s.created_by, s.created_at, s.started_at, s.closed_at, s.paused_at, s.delete_votes,
           s.starts_at, s.ends_at, s.switched, s.offered_by, (s.change_request IS NOT NULL) AS change_requested,
           (SELECT count(*)::int FROM som.tasks t WHERE t.scene_id = s.id) AS tasks,
           (SELECT count(*)::int FROM som.tasks t WHERE t.scene_id = s.id AND t.status IN ('approved', 'skipped')) AS done,
           (SELECT count(*)::int FROM som.tasks t WHERE t.scene_id = s.id AND t.status = 'submitted') AS waiting
      FROM som.scenes s WHERE s.pod_id = ${podId}
     ORDER BY (s.status = 'closed'), coalesce(s.started_at, s.starts_at, s.created_at) DESC
     LIMIT 300`;
  return json({ scenes });
}

/** A new draft: the phone picked its id and encrypted its plan. */
export async function POST(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  if (!isUuid(podId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const b = await body<{ id?: unknown; planEnc?: unknown }>(req);
  if (!isUuid(b?.id) || !isCipher(b?.planEnc, 'j1', 200_000)) return bad('That doesn’t look like a scene.');
  await sql`INSERT INTO som.scenes (id, pod_id, created_by, plan_enc) VALUES (${b!.id as string}, ${podId}, ${me.id}, ${b!.planEnc as string})`;
  return json({ ok: true });
}
