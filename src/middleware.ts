/**
 * Edge middleware: cheap cookie check + redirect.
 *
 * Heavy work (DB session validation, user lookup) happens in the API routes
 * themselves (Node runtime). The middleware just enforces the auth gate
 * before any HTML or API response is generated.
 *
 * Public paths (no cookie required):
 *   - /login, /register
 *   - /api/auth/* (login, register, me)
 *   - /_next/*, /favicon.ico, /logo.svg, etc.
 *
 * For every other path:
 *   - Reads `vp_session` cookie
 *   - If absent → redirect (browser) or 401 (API)
 *   - If present → forwards the session id via `x-vp-session-id` header
 *     for downstream handlers to validate.
 */

import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'vp_session';

function isPublicPath(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/register') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico' || pathname === '/logo.svg') return true;
  if (/\.(png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$/i.test(pathname)) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const sid = req.cookies.get(SESSION_COOKIE)?.value;

  if (!sid) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Pass session id to downstream API route handlers via REQUEST headers
  // (not response headers — that would leak the session token to the browser).
  // The header is read by `currentSessionIdServer()` in src/lib/auth.ts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-vp-session-id', sid);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (build assets)
     * - _next/image (image optimization)
     */
    '/((?!_next/static|_next/image).*)',
  ],
};
