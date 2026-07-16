/**
 * POST /api/insights/dismiss
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { dismissInsight } from'@/lib/teachingLayer';

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });
 const body = await req.json().catch(() => ({}));
 const signature = body.insight_signature ?? body.signature;
 if (!signature) {
 return NextResponse.json({ error:'insight_signature required'}, { status: 400 });
 }
 await dismissInsight(user.id, signature);
 return NextResponse.json({ success: true });
}
