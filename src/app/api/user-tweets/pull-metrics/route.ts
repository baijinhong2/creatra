/**
 * POST /api/user-tweets/pull-metrics
 * 拉 pending + URL 已有 的 user tweets 的 metrics
 * 优先拉 ≥ 24h 的(让推文有时间获得互动)
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { listPendingOldTweets, updateTweetMetrics, markTweetFailed, type TweetMetrics } from'@/lib/userTweets';
import { runTool } from'@/lib/tools';

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const onlyOld = body?.only_old !== false; // default true

 const tweets = await listPendingOldTweets(onlyOld ? 24 : 0);
 // Filter to current user
 const mine = tweets.filter((t) => t.user_id === user.id);

 const results: { id: string; ok: boolean; status: string }[] = [];

 for (const t of mine) {
 if (!t.tweet_id) {
 results.push({ id: t.id, ok: false, status:'no_tweet_id'});
 continue;
 }
 try {
 const r = await runTool('twitter_get_tweet_metrics', { tweet_id: t.tweet_id }, { userId: user.id });
 if (!r.ok) {
 await markTweetFailed(t.id, r.error ||'pull failed');
 results.push({ id: t.id, ok: false, status:'failed'});
 continue;
 }
 const data = r.data as Partial<TweetMetrics> | undefined;
 const metrics: TweetMetrics = {
 likes: data?.likes ?? 0,
 retweets: data?.retweets ?? 0,
 replies: data?.replies ?? 0,
 quotes: data?.quotes ?? 0,
 impressions: data?.impressions ?? 0,
 bookmarks: data?.bookmarks ?? 0,
 pulled_at: new Date().toISOString(),
 };
 await updateTweetMetrics(t.id, metrics,'pulled');
 results.push({ id: t.id, ok: true, status:'pulled'});
 } catch (e) {
 const msg = e instanceof Error ? e.message : String(e);
 await markTweetFailed(t.id, msg);
 results.push({ id: t.id, ok: false, status:'failed'});
 }
 }

 return NextResponse.json({
 success: true,
 pulled: results.filter((r) => r.ok).length,
 failed: results.filter((r) => !r.ok).length,
 results,
 });
}
