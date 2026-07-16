import { NextResponse } from'next/server';
import { currentUserServer } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

/**
 * GET /api/auth/me — returns the currently signed-in user, or { user: null }.
 */
export async function GET() {
 const user = await currentUserServer();
 return NextResponse.json({ user });
}
