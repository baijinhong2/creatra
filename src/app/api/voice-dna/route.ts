/**
 * GET:加载当前用户的 voice DNA
 * PATCH:更新 DNA features(微调)/ 标记过期
 * DELETE:标记过期
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { loadUserDna, saveUserDna, markDnaOutdated } from'@/lib/voiceDnaStore';
import { isValidFeatures, type VoiceDnaFeatures } from'@/lib/voiceDna';

export async function GET() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });
 const dna = await loadUserDna(user.id);
 return NextResponse.json({ has_dna: !!dna, dna });
}

export async function PATCH(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const action = body?.action as string | undefined;

 if (action ==='mark_outdated') {
 await markDnaOutdated(user.id);
 return NextResponse.json({ success: true });
 }

 if (action ==='update_features') {
 const dna = await loadUserDna(user.id);
 if (!dna) return NextResponse.json({ error:'no_dna'}, { status: 404 });

 const merged: VoiceDnaFeatures = {
 ...dna.features,
 ...(body.features as Partial<VoiceDnaFeatures>),
 };
 if (!isValidFeatures(merged)) {
 return NextResponse.json({ error:'invalid_features'}, { status: 400 });
 }
 const updated = await saveUserDna({
 user_id: user.id,
 source_type: dna.source_type,
 source_meta: { ...dna.source_meta, adjusted_from_version: dna.version },
 source_tweet_count: dna.source_tweet_count,
 features: merged,
 confidence: dna.confidence,
 sample_tweets: dna.sample_tweets ?? [],
 });
 return NextResponse.json({ success: true, dna: updated });
 }

 return NextResponse.json({ error:'unknown_action'}, { status: 400 });
}

export async function DELETE() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });
 await markDnaOutdated(user.id);
 return NextResponse.json({ success: true });
}
