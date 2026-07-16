/**
 * POST /api/voice-dna/synthesize-from-conversation
 * Path 4:基于 6 步对话问答合成 voice DNA
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { deepseek } from'@/lib/llm';
import { isValidFeatures, clampConfidence, type VoiceDnaFeatures } from'@/lib/voiceDna';
import { saveUserDna } from'@/lib/voiceDnaStore';
import { getVoiceTemplate } from'@/lib/voiceTemplates';

type Body = {
 q1_activities: string[];
 q1_text: string;
 q2_topics: string[];
 q2_text: string;
 q3_goals: string[];
 q3_text: string;
 q4_length:'short'|'medium'|'long';
 q4_tone:'serious'|'casual'|'sharp'|'warm';
 q4_emoji:'never'|'sometimes'|'often';
 q4_text: string;
 q5_text: string;
 q6_text: string;
};

const SYNTHESIS_PROMPT = `你是写作风格合成器。基于用户的 6 个回答 + 自由输入,合成 voice DNA。

## 真实性自审
1. **不编造** — 样本偏少就标"样本不足",不要凑数
2. **必须用户 specific** — 引用具体回答内容,不是通用话
3. **可执行** — DNA 之后能直接用来写
4. **Q6 真实样本 > 模板默认** — 用户写了的优先

## 合成规则
1. **Q6 有内容**:把它当主样本(像 Path A 那样从原文提取)
2. **Q5 详细**:从文字中识别具体人/风格,匹配 template 叠加
3. **Q1-Q4 调整**:
 - Q1 方向 → topics
 - Q2 聊什么 → topics, signature_patterns
 - Q3 获得什么 → topics, signature_patterns
 - Q4 length/tone/emoji → 量化调整 structure/hooks/tone
4. **所有 free text** → 补充 signature_patterns
5. **confidence**:
 - Q6 + Q5: 0.7
 - Q6 仅有: 0.6
 - Q5 详细: 0.5
 - 只 Q1-Q4: 0.4

## 输出 JSON
完整 voice DNA(同其他 path schema):
- sentence_length: { mean, p50, p90 } 字符数
- structure: { single_sentence, multi_sentence, list, question, dialogue } 比例(0-1,总和≈1)
- emoji_rate: 0-1
- punctuation: { exclamation, question, ellipsis, linebreak } 比例
- vocabulary: { top_words: 10个, domain_terms: 5个, avoids: 3个 }
- tone: { casual, professional, humorous, serious, warm } 比例(总和≈1)
- hooks: { data_first, contrarian, question, story, list } 比例
- topics: 5 个
- signature_patterns: 3-5 个
- language:'zh'|'en'|'mixed'只返回 JSON。`;

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = (await req.json().catch(() => ({}))) as Body;

 if (!body || typeof body !=='object') {
 return NextResponse.json({ error:'invalid_body'}, { status: 400 });
 }

 // 选主 template(基于 q1 方向 + q4 tone)
 const mainTemplateId = inferMainTemplate(body);
 const mainTemplate = getVoiceTemplate(mainTemplateId);

 // confidence
 const hasQ6 = body.q6_text && body.q6_text.trim().length > 10;
 const hasQ5 = body.q5_text && body.q5_text.trim().length > 10;
 const confidence = clampConfidence(
 hasQ6 && hasQ5 ? 0.7 : hasQ6 ? 0.6 : hasQ5 ? 0.5 : 0.4,
 );

 const samples: string[] = [];
 if (hasQ6) {
 // Q6 当作主样本
 const q6Lines = body.q6_text.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
 if (q6Lines.length > 0) samples.push(q6Lines[0]);
 if (q6Lines.length > 1) samples.push(q6Lines[1]);
 if (q6Lines.length > 2) samples.push(q6Lines[2]);
 }
 while (samples.length < 3 && mainTemplate) {
 samples.push(mainTemplate.sampleTweets[samples.length] ?? mainTemplate.sampleTweets[0]);
 }

 // 调 LLM 合成
 const userMsg = formatUserMsg(body);
 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: SYNTHESIS_PROMPT },
 { role:'user', content: userMsg },
 ],
 temperature: 0.3,
 max_tokens: 2500,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();

 let features: VoiceDnaFeatures;
 try {
 const parsed = JSON.parse(json);
 if (!isValidFeatures(parsed)) {
 throw new Error('Invalid features shape');
 }
 features = parsed;
 } catch {
 console.error('[synthesize-from-conversation] JSON parse failed, using template fallback');
 if (!mainTemplate) {
 return NextResponse.json(
 { error:'synthesis_failed', message:'无法合成 DNA'},
 { status: 500 },
 );
 }
 // Fallback:用主 template + 简单调整
 features = adjustTemplateByQuiz(mainTemplate.features, body);
 }

 // 追加 freeform 作为 signature pattern
 const sigAddons: string[] = [];
 if (body.q1_text.trim()) sigAddons.push(`Q1 自述:"${body.q1_text.trim().slice(0, 100)}"`);
 if (body.q2_text.trim()) sigAddons.push(`Q2 主题:"${body.q2_text.trim().slice(0, 100)}"`);
 if (body.q3_text.trim()) sigAddons.push(`Q3 目标:"${body.q3_text.trim().slice(0, 100)}"`);
 if (body.q4_text.trim()) sigAddons.push(`Q4 风格:"${body.q4_text.trim().slice(0, 100)}"`);
 if (body.q5_text.trim()) sigAddons.push(`Q5 欣赏:"${body.q5_text.trim().slice(0, 100)}"`);

 if (sigAddons.length > 0) {
 features.signature_patterns = [
 ...sigAddons.slice(0, 3),
 ...features.signature_patterns,
 ].slice(0, 5);
 }

 // 存
 const dna = await saveUserDna({
 user_id: user.id,
 source_type:'quiz',
 source_meta: {
 path:'4',
 q1: { activities: body.q1_activities, text: body.q1_text },
 q2: { topics: body.q2_topics, text: body.q2_text },
 q3: { goals: body.q3_goals, text: body.q3_text },
 q4: {
 length: body.q4_length,
 tone: body.q4_tone,
 emoji: body.q4_emoji,
 text: body.q4_text,
 },
 q5: body.q5_text,
 q6: body.q6_text,
 main_template: mainTemplateId,
 },
 source_tweet_count: hasQ6 ? 1 : 0,
 features,
 confidence,
 sample_tweets: samples,
 });

 return NextResponse.json({ success: true, dna });
}

function inferMainTemplate(body: Body): string {
 // 简单规则:Q1 决定大方向,Q4 决定微调
 if (body.q1_activities.includes('indie_dev') || body.q1_activities.includes('founder')) {
 return'operator';
 }
 if (body.q1_activities.includes('creator') || body.q1_activities.includes('student')) {
 return'storyteller';
 }
 if (body.q4_tone ==='sharp') return'provocateur';
 if (body.q4_tone ==='casual'&& body.q1_activities.includes('engineer')) return'operator';
 if (body.q4_tone ==='warm') return'storyteller';
 if (body.q4_tone ==='serious'&& body.q2_topics.includes('tutorial')) return'teacher';
 return'operator'; // fallback
}

function formatUserMsg(body: Body): string {
 return ['## Q1 做什么',
 `选项: ${body.q1_activities.join(',') ||'(无)'}`,
 `补充:"${body.q1_text}"`,'','## Q2 聊什么',
 `选项: ${body.q2_topics.join(',') ||'(无)'}`,
 `补充:"${body.q2_text}"`,'','## Q3 获得什么',
 `选项: ${body.q3_goals.join(',') ||'(无)'}`,
 `补充:"${body.q3_text}"`,'','## Q4 风格',
 `长度=${body.q4_length}, 语气=${body.q4_tone}, emoji=${body.q4_emoji}`,
 `补充:"${body.q4_text}"`,'','## Q5 欣赏什么(可选)',
 body.q5_text ||'(跳过)','','## Q6 写一条(可选,如有则当主样本)',
 body.q6_text ||'(跳过)',
 ].join('\n');
}

function adjustTemplateByQuiz(
 base: VoiceDnaFeatures,
 body: Body,
): VoiceDnaFeatures {
 const f = JSON.parse(JSON.stringify(base)) as VoiceDnaFeatures;

 // Q4 length
 if (body.q4_length ==='short') f.sentence_length.mean = Math.max(10, f.sentence_length.mean - 5);
 if (body.q4_length ==='long') f.sentence_length.mean += 5;

 // Q4 emoji
 if (body.q4_emoji ==='never') f.emoji_rate = 0;
 else if (body.q4_emoji ==='often') f.emoji_rate = Math.max(0.1, f.emoji_rate + 0.1);

 // Q4 tone
 if (body.q4_tone ==='casual') {
 f.tone.casual = Math.min(0.8, f.tone.casual + 0.2);
 f.tone.professional = Math.max(0, f.tone.professional - 0.15);
 }
 if (body.q4_tone ==='serious') {
 f.tone.serious = Math.min(0.6, f.tone.serious + 0.2);
 f.tone.casual = Math.max(0, f.tone.casual - 0.15);
 }
 if (body.q4_tone ==='sharp') {
 f.hooks.contrarian = Math.min(0.7, f.hooks.contrarian + 0.2);
 }
 if (body.q4_tone ==='warm') {
 f.tone.warm = Math.min(0.4, f.tone.warm + 0.15);
 }

 return f;
}
