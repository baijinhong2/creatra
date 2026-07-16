/**
 * POST /api/replies/sync
 * 拉用户最近推文的 reply,入库
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { syncRepliesForUser } from'@/lib/replies';
import { getDb, TABLE } from'@/lib/db';

const RATE_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const handle = (body.user_handle as string | undefined)?.replace(/^@/,'').trim();
 if (!handle) {
 return NextResponse.json({ error:'user_handle required'}, { status: 400 });
 }

 // Rate limit
 const db = getDb();
 if (db) {
 const r = await db.query<{ last_engagement_synced_at: string | null }>(
 `SELECT last_engagement_synced_at FROM ${TABLE.users} WHERE id = $1`,
 [user.id],
 );
 const last = r.rows[0]?.last_engagement_synced_at;
 if (last) {
 const elapsed = Date.now() - new Date(last).getTime();
 if (elapsed < RATE_LIMIT_MS && !body.force) {
 return NextResponse.json(
 {
 error:'rate_limited',
 message: `上次 sync ${Math.round(elapsed / 60000)} 分钟前,${Math.round((RATE_LIMIT_MS - elapsed) / 60000)} 分钟后可重试`,
 retry_after_minutes: Math.round((RATE_LIMIT_MS - elapsed) / 60000),
 },
 { status: 429 },
 );
 }
 }
 }

 try {
 const result = await syncRepliesForUser(
 user.id,
 handle,
 Number(body.lookback_tweets) || 5,
 Number(body.replies_per_tweet) || 10,
 );

 if (db) {
 await db.query(
 `UPDATE ${TABLE.users} SET last_engagement_synced_at = now() WHERE id = $1`,
 [user.id],
 );
 }

 return NextResponse.json({ success: true, synced: result });
 } catch (e) {
 const msg = e instanceof Error ? e.message : String(e);
 return NextResponse.json(
 { error:'sync_failed', message: msg },
 { status: 500 },
 );
 }
}
