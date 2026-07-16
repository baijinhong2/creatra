/**
 * LLM:从用户标记的推文 metrics 提取 pattern
 */

import { deepseek } from'./llm';
import type { UserTweet, TweetMetrics } from'./userTweets';

export type OutcomesPattern = {
 pattern: string;
 category:'content'|'style'|'timing'|'format'|'hook';
 evidence: string;
 confidence: number;
};

export type OutcomesSummary = {
 insufficient_data: boolean;
 sample_size: number;
 patterns: OutcomesPattern[];
};

const OUTCOMES_ANALYSIS_PROMPT = `你是 X 增长分析专家。基于用户最近标记"用了"的推文及其 metrics,找出 3-5 条 pattern。

## 真实性自审
1. **样本 < 10 条**:不强行出 pattern,返回 { insufficient_data: true, sample_size: N }
2. **pattern 必须是用户 specific**:不是"好内容互动高"这种通用话,而是"你的带具体数字的推文互动比平均高 3x"3. **每条 pattern 附证据**:引用 2-3 条具体推文 + 数字

## 输出 JSON 字段
{
 insufficient_data: boolean,
 sample_size: number,
 patterns: [
 {
 pattern: string, // 例:带具体数字的推文互动高 3x
 category:'content'|'style'|'timing'|'format'|'hook',
 evidence: string, // 引用 2-3 条推文 + 数字
 confidence: 0-1
 }
 ]
}

只返回 JSON,不要任何解释。`;

export async function analyzeOutcomes(
 userTweets: UserTweet[],
 windowDays: number = 30,
): Promise<OutcomesSummary> {
 const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
 const recent = userTweets.filter(
 (t) => new Date(t.marked_at).getTime() > cutoff && t.metrics !== null,
 );

 if (recent.length === 0) {
 return { insufficient_data: true, sample_size: 0, patterns: [] };
 }

 if (recent.length < 10) {
 return { insufficient_data: true, sample_size: recent.length, patterns: [] };
 }

 const tweetData = recent
 .slice(0, 50)
 .map((t) => {
 const m = t.metrics as TweetMetrics;
 return {
 text: t.tweet_text.slice(0, 200),
 marked_at: t.marked_at,
 likes: m.likes,
 retweets: m.retweets,
 replies: m.replies,
 impressions: m.impressions,
 engagement: m.likes + m.retweets * 2 + m.replies * 3,
 };
 });

 const userMsg = `样本量: ${recent.length} 条\n\n${tweetData
 .map(
 (t, i) =>
 `${i + 1}."${t.text}"\n marked_at: ${t.marked_at}\n engagement: ${t.engagement} (likes ${t.likes} / retweets ${t.retweets} / replies ${t.replies} / impressions ${t.impressions})`,
 )
 .join('\n\n')}`;

 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: OUTCOMES_ANALYSIS_PROMPT },
 { role:'user', content: userMsg },
 ],
 temperature: 0.3,
 max_tokens: 8000,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();

 try {
 const parsed = JSON.parse(json);
 return {
 insufficient_data: !!parsed.insufficient_data,
 sample_size: recent.length,
 patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
 };
 } catch {
 console.error('[outcomesAnalysis] JSON parse failed:', json.slice(0, 500));
 return { insufficient_data: true, sample_size: recent.length, patterns: [] };
 }
}

/**
 * 把 outcomes 格式化为可注入 prompt 的文本
 */
export function outcomesToPromptText(summary: OutcomesSummary): string {
 if (summary.insufficient_data || summary.patterns.length === 0) {
 return'';
 }
 return [
 `\n## 用户过往 outcomes pattern (样本: ${summary.sample_size} 条)`,
 ...summary.patterns.map(
 (p) => `- **${p.pattern}** (${(p.confidence * 100).toFixed(0)}% 置信, ${p.category})\n 证据: ${p.evidence}`,
 ),'\n**写新推文时,优先匹配高置信 pattern,避免低效角度**。',
 ].join('\n');
}
