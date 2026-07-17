/**
 * Edge middleware: cookie pass-through for API routes.
 *
 * 设计:HTML 页面允许未登录访问(guest 模式),只有 API 路由在没 session 时返回 401。
 * 客户端的 useAuthModal / page.tsx 决定何时弹登录 modal。
 *
 * Public paths(no cookie required):
 * - 任何 HTML 页面(主页 / onboarding / topics / health 等)— 允许 guest
 * - /api/auth/* (login, register, me)
 * - /_next/*, /favicon.ico, /logo.svg, etc.
 *
 * 对于其他 /api/* 路径:
 * - 读 vp_session cookie
 * - 缺失 → 401
 * - 存在 → 通过 x-vp-session-id header 传给下游
 */

import { NextRequest, NextResponse } from'next/server';

const SESSION_COOKIE ='vp_session';

function isAlwaysPublic(pathname: string): boolean {
 if (pathname.startsWith('/api/auth/')) return true;
 if (pathname.startsWith('/_next/')) return true;
 if (pathname ==='/favicon.ico'|| pathname ==='/logo.svg') return true;
 if (/\.(png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$/i.test(pathname)) return true;
 return false;
}

export function middleware(req: NextRequest) {
 const { pathname } = req.nextUrl;
 if (isAlwaysPublic(pathname)) return NextResponse.next();

 const sid = req.cookies.get(SESSION_COOKIE)?.value;

  if (!sid) {
  if (pathname.startsWith('/api/')) {
  return NextResponse.json(
  { error:'登录已过期,请重新登录', code:'auth_required' },
  { status: 401 },
  );
  }
  // HTML 页面:guest 模式放行(由客户端决定何时弹登录)
 } else {
 // 把 session id 传给下游 API 路由
 const requestHeaders = new Headers(req.headers);
 requestHeaders.set('x-vp-session-id', sid);
 return NextResponse.next({
 request: { headers: requestHeaders },
 });
 }

 return NextResponse.next();
}

export const config = {
 matcher: [
 /*
 * Match all request paths except:
 * - _next/static (build assets)
 * - _next/image (image optimization)
 */'/((?!_next/static|_next/image).*)',
 ],
};
