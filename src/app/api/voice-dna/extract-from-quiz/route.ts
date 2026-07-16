/**
 * POST /api/voice-dna/extract-from-quiz
 * Path C:从 quiz 答案合成 DNA
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import {
 synthesizeVoiceDnaFromQuiz,
 type QuizAnswers,
} from'@/lib/dnaSynthesis';
import { saveUserDna } from'@/lib/voiceDnaStore';
import type { VoiceTemplateId } from'@/lib/voiceTemplates';

type Body = {
 quiz_answers: QuizAnswers;
 compare_choices: VoiceTemplateId[];
 freeform?: string | null;
};

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = (await req.json().catch(() => ({}))) as Body;
 if (!body.quiz_answers || !Array.isArray(body.compare_choices)) {
 return NextResponse.json({ error:'invalid_body'}, { status: 400 });
 }

 if (body.compare_choices.length < 1 || body.compare_choices.length > 2) {
 return NextResponse.json({ error:'compare_choices must be 1-2'}, { status: 400 });
 }

 const validIds: VoiceTemplateId[] = ['operator','provocateur','teacher','storyteller','curator'];
 for (const id of body.compare_choices) {
 if (!validIds.includes(id)) {
 return NextResponse.json({ error: `unknown template: ${id}` }, { status: 400 });
 }
 }

 const { features, confidence, samples } = await synthesizeVoiceDnaFromQuiz({
 quiz_answers: body.quiz_answers,
 compare_choices: body.compare_choices,
 freeform: body.freeform ?? null,
 });

 const dna = await saveUserDna({
 user_id: user.id,
 source_type:'quiz',
 source_meta: {
 quiz_answers: body.quiz_answers,
 compare_choices: body.compare_choices,
 freeform: body.freeform ?? null,
 },
 source_tweet_count: 0,
 features,
 confidence,
 sample_tweets: samples,
 });

 return NextResponse.json({ success: true, dna });
}
