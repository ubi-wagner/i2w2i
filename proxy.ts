import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only: bounce people with no session cookie to /login.
// Real validation happens server-side in getCurrentUser() on every request.
const PUBLIC = [/^\/login$/, /^\/auth\//, /^\/api\/health$/];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (req.cookies.has('i2w2i_session')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|icon.svg).*)'],
};
