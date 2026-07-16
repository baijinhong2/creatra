import { NextRequest, NextResponse } from'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS, loginUser } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Sets `vp_session` cookie on success.
 */
export async function POST(request: NextRequest) {
 let body: { email?: string; password?: string };
 try {
 body = (await request.json()) as typeof body;
 } catch {
 return NextResponse.json({ error:'Invalid JSON'}, { status: 400 });
 }
 if (!body.email || !body.password) {
 return NextResponse.json({ error:'email + password 必填'}, { status: 400 });
 }
 const result = await loginUser(body.email, body.password);
 if (!result.ok) {
 return NextResponse.json({ error: result.error }, { status: 401 });
 }

 const res = NextResponse.json({ user: result.user });
 res.cookies.set(SESSION_COOKIE, result.sessionId, {
 httpOnly: true,
 sameSite:'lax',
 secure: process.env.NODE_ENV ==='production',
 path:'/',
 maxAge: SESSION_TTL_MS / 1000,
 });
 return res;
}
