/**
 * POST /api/topics/recommend
 * 生成今日 topic 推荐
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { generateTopicRecommendation } from'@/lib/topicIntelligence';

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const force = body.force === true;

 try {
 const result = await generateTopicRecommendation(user.id, force);
 if (!result) {
 return NextResponse.json({ error:'generation_failed'}, { status: 500 });
 }
 return NextResponse.json({ success: true, ...result });
 } catch (e) {
 return NextResponse.json(
 { error:'failed', message: e instanceof Error ? e.message : String(e) },
 { status: 500 },
 );
 }
}
