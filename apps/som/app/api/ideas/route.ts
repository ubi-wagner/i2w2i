import { bad, guard, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { builtInIdeas, demandIdeas } from '@/lib/ideas-data';

export const dynamic = 'force-dynamic';

// The built-in ideas, for people in a pod only: they never ship in the
// browser bundle, so nobody who isn't in a pod can read them.
export async function GET(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const [member] = await sql`SELECT 1 FROM som.members WHERE account_id = ${me.id} AND key_backup IS NOT NULL LIMIT 1`;
  if (!member) return bad('Not found', 404);
  return json({ sections: builtInIdeas(), demands: demandIdeas() });
}
