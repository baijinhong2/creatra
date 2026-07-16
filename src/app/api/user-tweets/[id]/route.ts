/**
 * PATCH /api/user-tweets/[id]
 * - paste_url
 * - mark_published
 * - mark_skipped
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import {
 pasteTweetUrl,
 markTweetPublished,
} from'@/lib/userTweets';
import { getDb, TABLE } from'@/lib/db';

export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> },
) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const { id } = await params;
 const body = await req.json().catch(() => ({}));

 if (body.action ==='paste_url') {
 if (!body.tweet_url) {
 return NextResponse.json({ error:'tweet_url required'}, { status: 400 });
 }
 if (!isValidXUrl(body.tweet_url)) {
 return NextResponse.json({ error:'invalid x.com URL'}, { status: 400 });
 }
 const tweet = await pasteTweetUrl(user.id, id, body.tweet_url);
 return NextResponse.json({
 success: true,
 user_tweet: tweet,
 next_action:'wait_24h_for_metrics',
 });
 }

 if (body.action ==='mark_published') {
 await markTweetPublished(user.id, id);
 return NextResponse.json({ success: true });
 }

 if (body.action ==='mark_skipped') {
 const db = getDb();
 if (db) {
 await db.query(
 `UPDATE ${TABLE.userTweets} SET status ='skipped', updated_at = now() WHERE id = $1 AND user_id = $2`,
 [id, user.id],
 );
 }
 return NextResponse.json({ success: true });
 }

 return NextResponse.json({ error:'unknown action'}, { status: 400 });
}

function isValidXUrl(url: string): boolean {
 return /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(url);
}
