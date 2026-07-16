/**
 * Topic Intelligence:检测 trends + 推荐今日选题
 */

import { deepseek } from'./llm';
import { runTool } from'./tools';
import { loadUserDna, dnaToPromptSection } from'./voiceDnaStore';
import { getCachedOutcomesSummary, saveOutcomesSummary } from'./outcomesStore';
import { listUserTweets } from'./userTweets';
import { getDb, TABLE } from'./db';

export type Trend = {
 topic: string;
 status:'rising'|'peaked'|'cooling'|'new';
 momentum: number; // -1 to 1
};

export type TopicRecommendation = {
 topic: string;
 angle: string;
 draft: string;
 reasoning: {
 why_this_topic: string;
 why_this_angle: string;
 voice_dna_match: string;
 outcomes_evidence: string;
 };
 best_time: { start: string; end: string; tz: string };
};

export type TopicRecResult = {
 main: TopicRecommendation;
 alternatives: Array<TopicRecommendation & { score: number }>;
 trends: Trend[];
 no_significant_trend: boolean;
 source_date: string;
};

const TOPIC_INTEL_PROMPT = `你是 X 增长选题专家。基于用户账号数据 + 当前热点,推荐今天最值得发的 1 条主推 + 4 条备选。

## 真实性自审
1. **不编造热点** — 只能基于下面输入的 trends 数据,不能自己编
2. **不重复推已有内容** — 跟用户过往 100 条推文去重
3. **不堆通用建议** —"好内容互动高"不算推荐,必须给具体 topic + angle
4. **必须能落地** — 推荐要带完整 draft 推文
5. **只在没明显新热点时**设 no_significant_trend=true

## 输出 JSON
{
 main: { topic, angle, draft, reasoning: {why_this_topic, why_this_angle, voice_dna_match, outcomes_evidence}, best_time: {start, end, tz} },
 alternatives: [4 个 {topic, angle, draft, score: 0-1}],
 trends: [{topic, status, momentum}],
 no_significant_trend: boolean
}

只返回 JSON,不要解释。`;

export async function detectTrends(
 userId: string,
 watchlistHandle?: string,
): Promise<Trend[]> {
 // Use web_search + twitter_search to find trending topics in user's niche
 const queries = ['trending AI developer tools 2026','indie hacker build in public lessons',
 ];

 const allResults: string[] = [];
 for (const q of queries) {
 try {
 const r = await runTool('web_search', { query: q, count: 5 }, { userId });
 if (r.ok && r.data) {
 const data = r.data as { results?: Array<{ title?: string; snippet?: string }> };
 const text = (data.results ?? [])
 .map((x) => `${x.title ??''} — ${x.snippet ??''}`)
 .join('\n');
 allResults.push(`## Query: ${q}\n${text}`);
 }
 } catch {}
 }

 if (allResults.length === 0) {
 return [];
 }

 // Use LLM to extract trends
 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 {
 role:'system',
 content:'从以下 web 搜索结果中提取 3-5 个趋势话题,每个标 status (rising/peaked/cooling/new) 和 momentum (-1 到 1)。只返回 JSON: {"trends": [{topic, status, momentum}]}',
 },
 { role:'user', content: allResults.join('\n\n').slice(0, 4000) },
 ],
 temperature: 0.3,
 max_tokens: 8000,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();

 try {
 const parsed = JSON.parse(json);
 if (Array.isArray(parsed.trends)) {
 return parsed.trends.slice(0, 5);
 }
 } catch {}

 // Fallback: extract keywords from titles
 const titles = allResults.join('').toLowerCase();
 const candidates = ['ai agent','claude','cursor','vibe coding','rag','memory','indie','mvp'];
 return candidates
 .filter((c) => titles.includes(c))
 .slice(0, 3)
 .map((c) => ({ topic: c, status:'new'as const, momentum: 0.5 }));
}

export async function generateTopicRecommendation(
 userId: string,
 forceRegenerate: boolean = false,
): Promise<TopicRecResult | null> {
 const today = new Date().toISOString().slice(0, 10);

 // Cache check
 if (!forceRegenerate) {
 const db = getDb();
 if (db) {
 const r = await db.query(
 `SELECT * FROM ${TABLE.topicRecommendations}
 WHERE user_id = $1 AND date = $2`,
 [userId, today],
 );
 if (r.rows.length > 0) {
 return r.rows[0].main_recommendation
 ? {
 main: r.rows[0].main_recommendation,
 alternatives: r.rows[0].alternatives ?? [],
 trends: r.rows[0].trends ?? [],
 no_significant_trend: r.rows[0].no_significant_trend,
 source_date: today,
 }
 : null;
 }
 }
 }

 // Load context
 const [dna, outcomes, userTweets, trends] = await Promise.all([
 loadUserDna(userId),
 getCachedOutcomesSummary(userId),
 listUserTweets(userId, { limit: 100 }),
 detectTrends(userId),
 ]);

 const dnaText = dna ? dnaToPromptSection(dna) :'(no DNA)';
 const recentTopics = userTweets
 .filter((t) => t.source ==='agent_draft'|| t.source ==='user_wrote')
 .slice(0, 30)
 .map((t) => t.tweet_text.slice(0, 80))
 .join('\n');

 const outcomesPatterns = outcomes && !outcomes.insufficient_data
 ? outcomes.patterns.map((p) => `- ${p.pattern} (${p.confidence})`).join('\n')
 :'(no patterns yet)';

 const userMsg = `## Voice DNA
${dnaText}

## 用户过往推文主题(去重,按时间)
${recentTopics ||'(无)'}

## 用户 outcomes pattern
${outcomesPatterns}

## 当前 trends
${trends.length > 0 ? trends.map((t) => `- ${t.topic} [${t.status}, momentum: ${t.momentum}]`).join('\n') :'(无明显 trends)'}`;

 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: TOPIC_INTEL_PROMPT },
 { role:'user', content: userMsg },
 ],
 temperature: 0.5,
 max_tokens: 8000,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();

 let result: TopicRecResult;
 try {
 const parsed = JSON.parse(json);
 result = {
 main: parsed.main,
 alternatives: parsed.alternatives ?? [],
 trends: parsed.trends ?? trends,
 no_significant_trend: !!parsed.no_significant_trend,
 source_date: today,
 };
 } catch {
 console.error('[topicIntelligence] JSON parse failed:', json.slice(0, 500));
 return null;
 }

 // Save
 const db = getDb();
 if (db) {
 await db.query(
 `INSERT INTO ${TABLE.topicRecommendations}
 (user_id, date, main_recommendation, alternatives, trends, no_significant_trend)
 VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)
 ON CONFLICT (user_id, date) DO UPDATE SET
 main_recommendation = EXCLUDED.main_recommendation,
 alternatives = EXCLUDED.alternatives,
 trends = EXCLUDED.trends,
 no_significant_trend = EXCLUDED.no_significant_trend,
 updated_at = now()`,
 [
 userId,
 today,
 JSON.stringify(result.main),
 JSON.stringify(result.alternatives),
 JSON.stringify(result.trends),
 result.no_significant_trend,
 ],
 );
 }

 return result;
}
