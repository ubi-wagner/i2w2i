import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only: bounce people with no session cookie to /login.
// Real validation happens server-side in getCurrentUser() on every request.
const PUBLIC = [
  /^\/login$/,
  /^\/auth\//,
  /^\/api\/health$/,
  // Albums are reachable by guests with a code, QR or public link; the page
  // and its API decide what each visitor may do.
  /^\/album\//,
  // Dev/CI stand-in for the bucket; authorized by the signature in the URL.
  /^\/api\/storage\/local$/,
];

const DEVICE_COOKIE = 'i2w2i_device';

// Every browser gets a long-lived random device id on its first visit, so
// activity records can tell when one phone used several names.
function withDevice(req: NextRequest, res?: NextResponse): NextResponse {
  if (req.cookies.has(DEVICE_COOKIE)) return res ?? NextResponse.next();
  const id = crypto.randomUUID();
  // Pass it to this request's server code too, which can't see a cookie set on the response yet.
  const headers = new Headers(req.headers);
  headers.set('x-i2w2i-device', id);
  const out = res ?? NextResponse.next({ request: { headers } });
  out.cookies.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 2 * 365 * 86_400,
  });
  return out;
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return withDevice(req);
  if (req.cookies.has('i2w2i_session')) return withDevice(req);
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return withDevice(req, NextResponse.redirect(url));
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|icon.svg).*)'],
};
