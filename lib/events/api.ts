import 'server-only';
import { loadAlbum, type Album } from './album';

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Loads the album for an API route, or returns the error response to send. */
export async function albumOr404(slug: string): Promise<Album | Response> {
  const album = await loadAlbum(slug);
  return album ?? json({ error: 'Not found' }, 404);
}

/** Same-origin check for state-changing requests (cookies are SameSite=Lax, this is belt and braces). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
