import { sql } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Railway's healthcheck: up, and the database answers. */
export async function GET() {
  try {
    await sql`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
