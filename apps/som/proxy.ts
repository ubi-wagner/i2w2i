import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only: people without a session cookie go to /login.
// Every page and API call checks the session properly on the server.
const PUBLIC = [/^\/login$/, /^\/join$/, /^\/api\/login$/, /^\/api\/health$/, /^\/api\/storage\/local$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//];
const SESSION_COOKIE = 'som_session';
const SESSION_DAYS = 90;

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!PUBLIC.some((re) => re.test(pathname)) && !token) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  // Keep the cookie alive while it's used (page loads only).
  if (token && req.method === 'GET' && req.headers.get('sec-fetch-dest') === 'document') {
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 86_400 });
  }
  return res;
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
