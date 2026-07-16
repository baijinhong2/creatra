import { NextResponse } from'next/server';
import { SESSION_COOKIE, currentSessionIdServer, deleteSession } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

/**
 * POST /api/auth/logout — invalidates the current session and clears the cookie.
 */
export async function POST() {
 const sid = await currentSessionIdServer();
 if (sid) await deleteSession(sid);
 const res = NextResponse.json({ ok: true });
 res.cookies.set(SESSION_COOKIE,'', {
 httpOnly: true,
 sameSite:'lax',
 secure: process.env.NODE_ENV ==='production',
 path:'/',
 maxAge: 0,
 });
 return res;
}
