import { NextRequest, NextResponse } from'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS, registerUser } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

/**
 * POST /api/auth/register
 * Body: { email, password, display_name? }
 *
 * On first registration ever, any pre-existing orphan rows (user_id IS NULL,
 * from pre-v0.3 schema) are claimed by the new user.
 */
export async function POST(request: NextRequest) {
 let body: {
 email?: string;
 password?: string;
 display_name?: string;
 };
 try {
 body = (await request.json()) as typeof body;
 } catch {
 return NextResponse.json({ error:'Invalid JSON'}, { status: 400 });
 }
 if (!body.email || !body.password) {
 return NextResponse.json({ error:'email + password 必填'}, { status: 400 });
 }
 const result = await registerUser(body.email, body.password, body.display_name);
 if (!result.ok) {
 return NextResponse.json({ error: result.error }, { status: 400 });
 }

 const res = NextResponse.json({
 user: result.user,
 claimed_existing: result.claimedExisting,
 });
 res.cookies.set(SESSION_COOKIE, result.sessionId, {
 httpOnly: true,
 sameSite:'lax',
 secure: process.env.NODE_ENV ==='production',
 path:'/',
 maxAge: SESSION_TTL_MS / 1000,
 });
 return res;
}
