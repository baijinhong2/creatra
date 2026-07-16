/**
 * GET /api/health/history
 */

import { NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { getHealthHistory } from'@/lib/accountHealth';

export async function GET() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });
 const reports = await getHealthHistory(user.id, 4);
 return NextResponse.json({ reports });
}
