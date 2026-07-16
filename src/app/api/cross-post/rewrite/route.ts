/**
 * POST /api/cross-post/rewrite
 * GET /api/cross-post/platforms
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { rewriteForPlatform, getPlatformMeta, type Platform } from'@/lib/crossPost';
import { getDb, TABLE } from'@/lib/db';

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const sourceTweet = body.source_tweet as string | undefined;
 const sourceUrl = (body.source_url as string | null) ?? null;
 const platforms: Platform[] = (body.platforms as Platform[]) ?? [];

 if (!sourceTweet) {
 return NextResponse.json({ error:'source_tweet required'}, { status: 400 });
 }
 if (platforms.length === 0) {
 return NextResponse.json({ error:'platforms required'}, { status: 400 });
 }
 if (platforms.length > 3) {
 return NextResponse.json({ error:'too many platforms (max 3)'}, { status: 400 });
 }

 try {
 const rewrites = await Promise.all(
 platforms.map((p) => rewriteForPlatform(user.id, sourceTweet, sourceUrl, p)),
 );

 // Save to history
 const db = getDb();
 if (db) {
 for (const r of rewrites) {
 await db.query(
 `INSERT INTO ${TABLE.crossPostRewrites}
 (user_id, source_tweet, source_url, platform, rewritten_text, style_notes, char_count, hashtags, source_attribution)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
 [
 user.id,
 sourceTweet.slice(0, 500),
 sourceUrl,
 r.platform,
 r.text,
 r.style_notes,
 r.char_count,
 r.hashtags,
 r.source_attribution,
 ],
 );
 }
 }

 return NextResponse.json({ success: true, rewrites });
 } catch (e) {
 return NextResponse.json(
 { error:'failed', message: e instanceof Error ? e.message : String(e) },
 { status: 500 },
 );
 }
}
