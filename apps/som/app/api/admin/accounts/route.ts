import { audit, hashPassword, passwordProblem } from '@/lib/server/auth';
import { bad, body, guard, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { suggestPassword } from '@/lib/suggest';
import { normalizeUsername } from '@/lib/usernames';

export const dynamic = 'force-dynamic';

/** The admin adds someone who'll start their own pod. The admin never gets into it. */
export async function POST(req: Request) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  if (!me.is_admin) return bad('Not found', 404);
  const b = await body<{ name?: unknown; username?: unknown; password?: unknown }>(req);
  const name = typeof b?.name === 'string' ? b.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const username = normalizeUsername(typeof b?.username === 'string' ? b.username : '');
  const password = (typeof b?.password === 'string' ? b.password.trim() : '') || suggestPassword();
  if (!name) return bad('Enter their name.');
  if (!username) return bad('Usernames are 2 to 32 letters or numbers (dots, dashes and _ are fine).');
  const problem = passwordProblem(password);
  if (problem) return bad(`Starting password: ${problem}`);
  try {
    const [a] = await sql<{ id: string }[]>`INSERT INTO som.accounts (username, display_name, password_hash, created_by) VALUES (${username}, ${name}, ${await hashPassword(password)}, ${me.id}) RETURNING id`;
    await audit(me.id, 'account.add', a!.id);
    return json({ credentials: { name, username, password } });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return bad(`Someone already has the username “${username}”.`);
    throw err;
  }
}
