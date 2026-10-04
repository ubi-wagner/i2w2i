import { audit, createSession, hashPassword, passwordProblem, revokeAll, verifyPassword } from '@/lib/server/auth';
import { bad, body, guard, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const b = await body<{ current?: unknown; next?: unknown }>(req);
  const next = typeof b?.next === 'string' ? b.next : '';
  const problem = passwordProblem(next);
  if (problem) return bad(problem);
  const [row] = await sql<{ password_hash: string | null }[]>`SELECT password_hash FROM som.accounts WHERE id = ${me.id}`;
  if (row?.password_hash && !(await verifyPassword(typeof b?.current === 'string' ? b.current : '', row.password_hash))) {
    return bad('Your current password isn’t right.');
  }
  await sql`UPDATE som.accounts SET password_hash = ${await hashPassword(next)} WHERE id = ${me.id}`;
  // Every other device signs in again.
  await revokeAll(me.id);
  await createSession(me.id);
  await audit(me.id, 'password.changed');
  return json({ ok: true });
}
