/**
 * GET:今日推荐(不重生成)
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { getDb, TABLE } from'@/lib/db';

export async function GET(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const { searchParams } = new URL(req.url);
 const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

 const db = getDb();
 if (!db) return NextResponse.json({ error:'db_unavailable'}, { status: 503 });

 const r = await db.query(
 `SELECT * FROM ${TABLE.topicRecommendations}
 WHERE user_id = $1 AND date = $2`,
 [user.id, date],
 );

 if (r.rows.length === 0) {
 return NextResponse.json({ result: null });
 }

 const row = r.rows[0];
 return NextResponse.json({
 result: {
 main: row.main_recommendation,
 alternatives: row.alternatives ?? [],
 trends: row.trends ?? [],
 no_significant_trend: row.no_significant_trend,
 source_date: date,
 },
 });
}
