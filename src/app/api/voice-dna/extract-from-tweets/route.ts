/**
 * POST /api/voice-dna/extract-from-tweets
 * Path A + Path B1:从推文提取 DNA
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { extractVoiceDnaFromTweets } from'@/lib/dnaExtraction';
import { saveUserDna } from'@/lib/voiceDnaStore';
import type { VoiceDnaFeatures } from'@/lib/voiceDna';

const TWEETS_PER_HANDLE = 25;
const MIN_TWEETS = 5;
const MAX_TWEETS = 75;

type Body = {
 handles: string[];
 isOwnTweets?: boolean;
};

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = (await req.json().catch(() => ({}))) as Body;
 const handles = (body.handles || []).map((h) => h.replace(/^@/,'').trim()).filter(Boolean);

 if (handles.length === 0) {
 return NextResponse.json({ error:'handles required'}, { status: 400 });
 }
 if (handles.length > 3) {
 return NextResponse.json({ error:'too many handles (max 3)'}, { status: 400 });
 }

 // Pull tweets for each handle via the existing twitter tool
 const allTweets: { handle: string; text: string }[] = [];
 const failures: string[] = [];

 for (const handle of handles) {
 try {
 const tweets = await pullTweetsForHandle(handle, TWEETS_PER_HANDLE, user.id);
 if (tweets.length === 0) {
 failures.push(handle);
 continue;
 }
 tweets.forEach((t) => allTweets.push({ handle, text: t }));
 } catch (e) {
 console.warn(`[extract-from-tweets] failed for ${handle}:`, e);
 failures.push(handle);
 }
 }

 // Filter retweets, replies, very short
 const filtered = allTweets
 .map((t) => ({ ...t, text: t.text.trim() }))
 .filter((t) => t.text.length >= 10)
 .filter((t) => !/^RT\s+/i.test(t.text))
 .filter((t) => !/^@\w+/.test(t.text));

 if (filtered.length < MIN_TWEETS) {
 return NextResponse.json(
 {
 error:'insufficient_samples',
 message: `只拉到 ${filtered.length} 条推文,至少需要 ${MIN_TWEETS} 条`,
 failures,
 suggested_action: filtered.length === 0 ?'use_path_b':'try_different_handles',
 },
 { status: 409 },
 );
 }

 // Cap total
 const capped = filtered.slice(0, MAX_TWEETS);

 // Extract DNA
 const { features, confidence, samples } = await extractVoiceDnaFromTweets(
 capped.map((t) => t.text),
 );

 const isOwn = body.isOwnTweets === true && handles.length === 1;
 const sourceType = isOwn ?'own_tweets':'reference_handles';

 // Save
 const dna = await saveUserDna({
 user_id: user.id,
 source_type: sourceType,
 source_meta: { handles, per_handle_counts: countByHandle(capped) },
 source_tweet_count: capped.length,
 features,
 confidence,
 sample_tweets: samples,
 });

 return NextResponse.json({ success: true, dna });
}

async function pullTweetsForHandle(handle: string, count: number, userId: string): Promise<string[]> {
 // Use the same Twitter tool the agent uses
 const { runTool } = await import('@/lib/tools');
 const result = await runTool('twitter_get_user_tweets', { username: handle, count }, { userId });
 if (!result.ok) {
 throw new Error(result.error ||'twitter tool failed');
 }
 // Result shape: { tweets: [{text, ...}] } — be defensive
 const data = result.data as { tweets?: Array<{ text?: string }> } | undefined;
 if (!data?.tweets) return [];
 return data.tweets.map((t) => t.text ??'').filter(Boolean);
}

function countByHandle(items: Array<{ handle: string }>): Record<string, number> {
 const c: Record<string, number> = {};
 for (const i of items) c[i.handle] = (c[i.handle] ?? 0) + 1;
 return c;
}
