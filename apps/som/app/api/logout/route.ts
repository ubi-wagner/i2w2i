import { endSession } from '@/lib/server/auth';
import { bad, json, sameOrigin } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad('Bad origin', 403);
  await endSession();
  return json({ ok: true });
}
