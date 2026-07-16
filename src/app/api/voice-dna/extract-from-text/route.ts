/**
 * POST /api/voice-dna/extract-from-text
 * Path 1b:用户粘自己的文字 → LLM 拆 5+ 段 → 同一 DNA 提取 prompt
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { deepseek } from'@/lib/llm';
import { extractVoiceDnaFromTweets } from'@/lib/dnaExtraction';
import { saveUserDna } from'@/lib/voiceDnaStore';

const MIN_CHARS = 200;
const MAX_CHARS = 5000;
const MIN_CHUNKS = 5;

type Body = {
 text: string;
 source_types?: string[];
};

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = (await req.json().catch(() => ({}))) as Body;
 const text = (body.text ??'').trim();
 const sourceTypes = body.source_types ?? [];

 if (text.length < MIN_CHARS) {
 return NextResponse.json(
 {
 error:'text_too_short',
 message: `至少需要 ${MIN_CHARS} 字,现在 ${text.length} 字`,
 },
 { status: 400 },
 );
 }
 if (text.length > MAX_CHARS) {
 return NextResponse.json(
 {
 error:'text_too_long',
 message: `最多 ${MAX_CHARS} 字,现在 ${text.length} 字。先截取 5-10 段有代表性的内容。`,
 },
 { status: 400 },
 );
 }

 // Step 1: LLM 拆分
 const SPLIT_PROMPT = `把以下用户内容拆分成 5-10 个独立片段(段落 / 推文 / 段落)。
每个片段:
- 至少 10 字符
- 是完整的句子或段落
- 不重叠
- 反映不同的写作场景(开头 / 中间 / 结尾)
- 保留原文,只切不润色

输入:"""${text}"""只返回 JSON: {"chunks": ["...","...", ...]}
`;

 let chunks: string[] = [];
 try {
 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [{ role:'user', content: SPLIT_PROMPT }],
 temperature: 0.2,
 max_tokens: 3000,
 });
 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
 const parsed = JSON.parse(json);
 console.log("[split] raw response length:", raw.length,"first 200:", raw.slice(0, 200));
 if (Array.isArray(parsed.chunks)) {
 chunks = parsed.chunks
 .map((c: any) => String(c).trim())
 .filter((c: string) => c.length >= 10);
 }
 } catch (e) {
 console.error('[extract-from-text] split failed:', e);
 }

 // Fallback: 如果 LLM 拆分失败,按双换行 / 句号简单切
 if (chunks.length < MIN_CHUNKS) {
 const fallback = text
 .split(/\n\s*\n|\.(?:\s|$)/)
 .map((s) => s.trim())
 .filter((s) => s.length >= 20);
 chunks = fallback;
 }

 if (chunks.length < MIN_CHUNKS) {
 return NextResponse.json(
 {
 error:'cannot_split',
 message: `只能拆出 ${chunks.length} 段,至少 ${MIN_CHUNKS} 段。试试粘贴多段不同场景的内容(短+长+列表)。`,
 },
 { status: 400 },
 );
 }

 // Step 2: 调同一 DNA 提取 prompt
 const { features, confidence, samples } = await extractVoiceDnaFromTweets(chunks);

 // Step 3: 存
 const dna = await saveUserDna({
 user_id: user.id,
 source_type:'quiz', // 复用,因为我们的 schema 没有'paste'枚举
 source_meta: {
 path:'1b',
 source_types: sourceTypes,
 text_length: text.length,
 chunk_count: chunks.length,
 },
 source_tweet_count: chunks.length,
 features,
 confidence,
 sample_tweets: samples,
 });

 return NextResponse.json({
 success: true,
 dna,
 debug: { chunk_count: chunks.length, text_length: text.length },
 });
}
