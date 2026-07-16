/**
 * GET /api/insights/teaching-layer
 * POST /api/insights/dismiss
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { generateTeachingInsights } from'@/lib/teachingLayer';

export async function GET() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });
 const insights = await generateTeachingInsights(user.id);
 return NextResponse.json({ insights, show_count: Math.min(insights.length, 2) });
}
