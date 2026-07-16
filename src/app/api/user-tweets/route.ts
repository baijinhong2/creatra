/**
 * GET:list user tweets
 * POST:mark as used
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import {
 listUserTweets,
 markTweetAsUsed,
 type UserTweetStatus,
} from'@/lib/userTweets';

export async function GET(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const { searchParams } = new URL(req.url);
 const status = (searchParams.get('status') as UserTweetStatus | null) ?? undefined;
 const limit = parseInt(searchParams.get('limit') ??'50', 10);

 const tweets = await listUserTweets(user.id, { status, limit });
 return NextResponse.json({ tweets, count: tweets.length });
}

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 if (!body?.tweet_text || !body?.source) {
 return NextResponse.json({ error:'tweet_text and source required'}, { status: 400 });
 }

 const tweet = await markTweetAsUsed(user.id, {
 tweet_text: body.tweet_text,
 source: body.source,
 draft_session_id: body.draft_session_id ?? null,
 draft_message_id: body.draft_message_id ?? null,
 });

 return NextResponse.json({ success: true, user_tweet: tweet });
}
