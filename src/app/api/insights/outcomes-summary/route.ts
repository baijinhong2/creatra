/**
 * POST /api/insights/outcomes-summary
 * 生成/重生成本周 outcomes pattern summary
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { listUserTweets } from'@/lib/userTweets';
import { analyzeOutcomes } from'@/lib/outcomesAnalysis';
import { getCachedOutcomesSummary, saveOutcomesSummary } from'@/lib/outcomesStore';

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const force = body?.force === true;
 const windowDays = body?.window_days ?? 30;

 if (!force) {
 const cached = await getCachedOutcomesSummary(user.id);
 if (cached) {
 return NextResponse.json({ success: true, summary: cached, cached: true });
 }
 }

 // Get all user tweets with metrics
 const allTweets = await listUserTweets(user.id, { limit: 200 });
 const withMetrics = allTweets.filter((t) => t.metrics !== null);

 if (withMetrics.length === 0) {
 const empty = { insufficient_data: true, sample_size: 0, patterns: [] };
 await saveOutcomesSummary(user.id, empty);
 return NextResponse.json({ success: true, summary: empty, cached: false });
 }

 const summary = await analyzeOutcomes(withMetrics, windowDays);
 await saveOutcomesSummary(user.id, summary);

 return NextResponse.json({ success: true, summary, cached: false });
}

export async function GET() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });
 const cached = await getCachedOutcomesSummary(user.id);
 return NextResponse.json({ summary: cached });
}
