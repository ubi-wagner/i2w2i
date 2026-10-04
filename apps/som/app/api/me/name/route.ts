import { bad, body, guard, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const b = await body<{ name?: unknown }>(req);
  const name = typeof b?.name === 'string' ? b.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (!name) return bad('Enter a name.');
  await sql`UPDATE som.accounts SET display_name = ${name} WHERE id = ${me.id}`;
  return json({ ok: true });
}
