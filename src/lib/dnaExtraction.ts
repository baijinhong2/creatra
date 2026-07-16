/**
 * LLM prompt + 调用:从推文列表提取 voice DNA
 */

import { deepseek } from'./llm';
import { isValidFeatures, clampConfidence, type VoiceDnaFeatures } from'./voiceDna';

const DNA_EXTRACTION_PROMPT = `你是一个写作风格分析师。基于用户的 X 推文,提取结构化的"声音 DNA"。

## 真实性自审(必须遵守)
1. **不编造数据**:统计不到就老实说"样本不足",不要凑数字
2. **不套通用话**:"casual""professional"没用 — 要给具体特征(如"从不堆术语,平均句长 18 字")
3. **数据驱动**:每个特征后面用推文原文举例(引用 tweet 编号 T1/T2/T3)
4. **不夸大置信度**:样本 < 10 条标 confidence 0.5,≥ 30 条才标 0.9+
5. **只返回 JSON,不要 markdown 代码块,不要任何解释文字**

## 输出 JSON 字段(严格按此 schema)
- sentence_length: { mean, p50, p90 } 字符数
- structure: { single_sentence, multi_sentence, list, question, dialogue } 比例(0-1)
- emoji_rate: 0-1
- punctuation: { exclamation, question, ellipsis, linebreak } 比例
- vocabulary: { top_words: 10个, domain_terms: 5个行业词, avoids: 3个明显不用的 }
- tone: { casual, professional, humorous, serious, warm } 比例(总和≈1)
- hooks: { data_first, contrarian, question, story, list } 开头方式比例
- topics: 5 个主题
- signature_patterns: 3-5 个最标志特征
- language:'zh'|'en'|'mixed'## 推文(共 N 条)
T1: ...
T2: ...
...

返回格式示例:
{"sentence_length":{"mean":18,"p50":16,"p90":32},"structure":{"single_sentence":0.4,"multi_sentence":0.35,"list":0.1,"question":0.15,"dialogue":0},"emoji_rate":0.05,"punctuation":{"exclamation":0.02,"question":0.3,"ellipsis":0.1,"linebreak":0.4},"vocabulary":{"top_words":["...","..."],"domain_terms":["..."],"avoids":["..."]},"tone":{"casual":0.6,"professional":0.2,"humorous":0.1,"serious":0.05,"warm":0.05},"hooks":{"data_first":0.1,"contrarian":0.2,"question":0.3,"story":0.1,"list":0.3},"topics":["...","..."],"signature_patterns":["...","..."],"language":"en"}`;

/**
 * 调 LLM 提取 voice DNA
 * @param tweets 推文文本列表
 * @returns features + confidence + 3 条 sample tweets
 */
export async function extractVoiceDnaFromTweets(
 tweets: string[],
): Promise<{ features: VoiceDnaFeatures; confidence: number; samples: string[] }> {
 if (tweets.length === 0) {
 throw new Error('No tweets to extract DNA from');
 }

 const tweetList = tweets
 .map((t, i) => `T${i + 1}: ${t}`)
 .join('\n');

 const userMsg = `推文(共 ${tweets.length} 条):\n${tweetList}`;

 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: DNA_EXTRACTION_PROMPT },
 { role:'user', content: userMsg },
 ],
 temperature: 0.2,
 max_tokens: 8000,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';

 // Strip markdown code block if present
 const json = raw
 .replace(/^```(?:json)?\s*/i,'')
 .replace(/```\s*$/,'')
 .trim();

 let parsed: unknown;
 try {
 parsed = JSON.parse(json);
 } catch (e) {
 console.error('[dnaExtraction] JSON parse failed:', json.slice(0, 500));
 throw new Error('LLM returned invalid JSON');
 }

 if (!isValidFeatures(parsed)) {
 console.error('[dnaExtraction] Invalid features shape:', parsed);
 throw new Error('LLM returned invalid features shape');
 }

 // Confidence: based on sample size
 const confidence = clampConfidence(
 tweets.length < 5 ? 0.3 : tweets.length < 10 ? 0.5 : tweets.length < 30 ? 0.75 : 0.9,
 );

 // Pick 3 samples: evenly spaced
 const step = Math.max(1, Math.floor(tweets.length / 3));
 const samples = [
 tweets[0] ??'',
 tweets[step] ??'',
 tweets[step * 2] ??'',
 ].filter((s) => s.length > 0);

 return { features: parsed, confidence, samples };
}
