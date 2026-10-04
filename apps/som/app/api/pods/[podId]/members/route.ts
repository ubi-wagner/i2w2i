import { audit, hashPassword, passwordProblem } from '@/lib/server/auth';
import { bad, body, guard, isUuid, isWrapped, json } from '@/lib/server/api';
import { sql } from '@/lib/server/db';
import { podMembers, podRole } from '@/lib/server/pods';
import { suggestPassword } from '@/lib/suggest';
import { normalizeUsername } from '@/lib/usernames';

export const dynamic = 'force-dynamic';
const MAX_MEMBERS = 6;

// Adding a partner: a new account with the username and starting password
// the member chose, plus the pod key wrapped with a one-time secret that only
// travels in the link they're sent. The server never sees that secret.
export async function POST(req: Request, { params }: { params: Promise<{ podId: string }> }) {
  const me = await guard(req);
  if (me instanceof Response) return me;
  const { podId } = await params;
  if (!isUuid(podId) || !(await podRole(me.id, podId))) return bad('Not found', 404);
  const b = await body<{ name?: unknown; username?: unknown; password?: unknown; role?: unknown; invite?: unknown }>(req);
  const name = typeof b?.name === 'string' ? b.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const username = normalizeUsername(typeof b?.username === 'string' ? b.username : '');
  const password = (typeof b?.password === 'string' ? b.password.trim() : '') || suggestPassword();
  if (!name) return bad('Enter their name.');
  if (!username) return bad('Usernames are 2 to 32 letters or numbers (dots, dashes and _ are fine).');
  const problem = passwordProblem(password);
  if (problem) return bad(`Starting password: ${problem}`);
  if ((b?.role !== 'lead' && b?.role !== 'follow') || !isWrapped(b?.invite)) return bad('That doesn’t look like an invite.');
  if ((await podMembers(podId)).length >= MAX_MEMBERS) return bad('This pod is full.');
  const [taken] = await sql`SELECT 1 FROM som.accounts WHERE username = ${username}`;
  if (taken) return bad(`Someone already has the username “${username}”.`);
  try {
    const id = await sql.begin(async (tx) => {
      const [a] = await tx<{ id: string }[]>`
        INSERT INTO som.accounts (username, display_name, password_hash, created_by) VALUES (${username}, ${name}, ${await hashPassword(password)}, ${me.id}) RETURNING id`;
      await tx`INSERT INTO som.members (pod_id, account_id, role, invite, added_by) VALUES (${podId}, ${a!.id}, ${b!.role as string}, ${tx.json(b!.invite as never)}, ${me.id})`;
      return a!.id;
    });
    await audit(me.id, 'member.add', id);
    return json({ credentials: { name, username, password } });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return bad(`Someone already has the username “${username}”.`);
    throw err;
  }
}
