/**
 * Account Health 报告生成
 */

import { getDb, TABLE } from'./db';
import { runTool } from'./tools';
import { listUserTweets } from'./userTweets';
import { deepseek } from'./llm';
import { loadUserDna } from'./voiceDnaStore';

export type HealthMetrics = {
 followers: { start: number; end: number; delta: number; delta_pct: number } | null;
 tweets_published: number;
 avg_engagement: number;
 best_time_slot: { day: string; hour_range: string; multiplier: number } | null;
 best_type: { type: string; avg_engagement: number; count: number } | null;
 worst_type: { type: string; avg_engagement: number; count: number } | null;
 new_followers_sample: Array<{ handle: string; bio: string }>;
 most_quoted: { tweet_text: string; quote_count: number; url: string } | null;
};

export type HealthReport = {
 week: string;
 week_start: string;
 week_end: string;
 generated_at: string;
 metrics: HealthMetrics;
 outcomes_summary: string;
 recommendations: [string, string, string];
};

const HEALTH_PROMPT = `你是 X 账号分析师。基于用户的推文 metrics + outcomes pattern,生成每周账号健康报告。

## 真实性自审
1. **数据说话** — 报告必须基于输入数据,不编"X 增长靠..."通用话
2. **3 维度** — 报告覆盖:数据(efficiency)/ 趋势(trend)/ 建议(actionable)
3. **建议可执行** — 不是"做更好的内容",而是"你周三发的推文互动比平均低 40%,建议改周二/周四"## 输出 JSON
{
 outcomes_summary: string, // 1-2 句话总结 pattern
 recommendations: [str, str, str] // 3 条 actionable 建议
}

只返回 JSON。`;

/**
 * Generate health report for the user.
 * @param userId user id
 * @param xHandle user's X handle (used to pull tweets)
 * @param weekStart ISO date string (Monday)
 */
export async function generateHealthReport(
 userId: string,
 xHandle: string | null,
 weekStart?: string,
): Promise<HealthReport | null> {
 if (!xHandle) {
 return null;
 }

 // Default to last week's Monday
 const start = weekStart ?? getLastMondayISO();
 const end = getSundayISO(start);

 // Pull last 30 days of tweets
 let tweets: any[] = [];
 try {
 const r = await runTool('twitter_get_user_tweets',
 { username: xHandle, count:'50'},
 { userId },
 );
 if (r.ok) {
 const data = r.data as any;
 tweets = extractTweetsList(data);
 }
 } catch {}

 // Filter to the past 30 days
 const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
 const recent = tweets
 .map((t) => ({
 ...t,
 published_at: new Date(t.created_at ?? t.published_at ?? Date.now()),
 text: t.full_text ?? t.text ??'',
 likes: t.favorite_count ?? t.likes ?? 0,
 retweets: t.retweet_count ?? t.retweets ?? 0,
 replies: t.reply_count ?? t.replies ?? 0,
 impressions: t.views?.count ?? t.impressions ?? 0,
 isRT: !!t.retweeted_status_id_str,
 isReply: !!t.in_reply_to_status_id_str,
 }))
 .filter((t) => t.published_at.getTime() > cutoff)
 .filter((t) => !t.isRT && !t.isReply);

 const tweetCount = recent.length;
 const avgEngagement =
 tweetCount > 0
 ? recent.reduce(
 (s, t) => s + t.likes + t.retweets * 2 + t.replies * 3,
 0,
 ) / tweetCount
 : 0;

 // Best time slot
 const timeSlots: Record<string, { total: number; count: number }> = {};
 const dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
 for (const t of recent) {
 const day = dayNames[t.published_at.getDay()];
 const hour = t.published_at.getHours();
 const slot = `${day} ${hour}-${hour + 1}`;
 const engagement = t.likes + t.retweets * 2 + t.replies * 3;
 timeSlots[slot] = timeSlots[slot] ?? { total: 0, count: 0 };
 timeSlots[slot].total += engagement;
 timeSlots[slot].count += 1;
 }

 const sortedSlots = Object.entries(timeSlots)
 .filter(([, v]) => v.count > 0)
 .map(([k, v]) => ({ slot: k, avg: v.total / v.count, count: v.count }))
 .sort((a, b) => b.avg - a.avg);

 const bestTimeSlot =
 sortedSlots.length > 0
 ? {
 day: sortedSlots[0].slot.split('')[0],
 hour_range: sortedSlots[0].slot.split('')[1],
 multiplier: sortedSlots[0].avg / Math.max(avgEngagement, 1),
 }
 : null;

 // Inferred type buckets
 const typeBuckets: Record<string, { total: number; count: number }> = {
 recap: { total: 0, count: 0 },
 howto: { total: 0, count: 0 },
 opinion: { total: 0, count: 0 },
 thread: { total: 0, count: 0 },
 other: { total: 0, count: 0 },
 };
 for (const t of recent) {
 const type = inferType(t.text);
 const eng = t.likes + t.retweets * 2 + t.replies * 3;
 typeBuckets[type].total += eng;
 typeBuckets[type].count += 1;
 }
 const typed = Object.entries(typeBuckets)
 .filter(([, v]) => v.count > 0)
 .map(([k, v]) => ({ type: k, avg_engagement: v.total / v.count, count: v.count }))
 .sort((a, b) => b.avg_engagement - a.avg_engagement);
 const bestType = typed[0] ?? null;
 const worstType = typed[typed.length - 1] ?? null;

 const report: HealthReport = {
 week: `${start} ~ ${end}`,
 week_start: start,
 week_end: end,
 generated_at: new Date().toISOString(),
 metrics: {
 followers: null, // cookie mode can't reliably pull this
 tweets_published: tweetCount,
 avg_engagement: avgEngagement,
 best_time_slot: bestTimeSlot,
 best_type: bestType,
 worst_type: worstType,
 new_followers_sample: [],
 most_quoted: null,
 },
 outcomes_summary:'',
 recommendations: ['数据样本不足,继续标记 ≥10 条推文后再看','保持当前频率','持续标记用了的推文'],
 };

 // LLM: outcomes summary + 3 recommendations
 if (recent.length >= 3) {
 try {
 const tweetSummary = recent
 .slice(0, 20)
 .map(
 (t, i) =>
 `${i + 1}."${t.text.slice(0, 60)}"— engagement ${t.likes + t.retweets * 2 + t.replies * 3} (likes ${t.likes} retweets ${t.retweets} replies ${t.replies})`,
 )
 .join('\n');

 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: HEALTH_PROMPT },
 {
 role:'user',
 content: `本周 ${recent.length} 条原创推文:\n${tweetSummary}\n\nbest_type: ${bestType?.type ??'?'}\nworst_type: ${worstType?.type ??'?'}\nbest_time: ${bestTimeSlot?.day ??'?'} ${bestTimeSlot?.hour_range ??'?'}`,
 },
 ],
 temperature: 0.4,
 max_tokens: 8000,
 });
 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
 const parsed = JSON.parse(json);
 if (parsed.outcomes_summary) report.outcomes_summary = parsed.outcomes_summary;
 if (Array.isArray(parsed.recommendations)) {
 report.recommendations = parsed.recommendations.slice(0, 3) as [string, string, string];
 }
 } catch {
 // ignore
 }
 }

 // Save
 const db = getDb();
 if (db) {
 await db.query(
 `INSERT INTO ${TABLE.healthReports}
 (user_id, week_start, week_end, report)
 VALUES ($1, $2, $3, $4::jsonb)
 ON CONFLICT (user_id, week_start) DO UPDATE SET
 report = EXCLUDED.report,
 generated_at = now()`,
 [userId, start, end, JSON.stringify(report)],
 );
 }

 return report;
}

export async function getLatestHealthReport(userId: string): Promise<HealthReport | null> {
 const db = getDb();
 if (!db) return null;
 const r = await db.query(
 `SELECT * FROM ${TABLE.healthReports}
 WHERE user_id = $1
 ORDER BY week_start DESC LIMIT 1`,
 [userId],
 );
 if (r.rows.length === 0) return null;
 return r.rows[0].report as HealthReport;
}

export async function getHealthHistory(userId: string, limit: number = 4): Promise<HealthReport[]> {
 const db = getDb();
 if (!db) return [];
 const r = await db.query(
 `SELECT * FROM ${TABLE.healthReports}
 WHERE user_id = $1
 ORDER BY week_start DESC LIMIT $2`,
 [userId, limit],
 );
 return r.rows.map((row) => row.report as HealthReport);
}

// ── helpers ──

function getLastMondayISO(): string {
 const d = new Date();
 const day = d.getUTCDay();
 const offset = day === 0 ? 6 : day - 1;
 d.setUTCDate(d.getUTCDate() - offset - 7);
 return d.toISOString().slice(0, 10);
}

function getSundayISO(mondayISO: string): string {
 const d = new Date(mondayISO);
 d.setUTCDate(d.getUTCDate() + 6);
 return d.toISOString().slice(0, 10);
}

function extractTweetsList(data: any): any[] {
 return (
 data?.tweets ??
 data?.data?.user?.result?.timeline_v2?.timeline?.instructions
 ?.flatMap((i: any) => i.entries ?? [])
 ?.map((e: any) => e?.content?.itemContent?.tweet_results?.result?.legacy)
 ?.filter(Boolean) ??
 []
 );
}

function inferType(text: string):'recap'|'howto'|'opinion'|'thread'|'other'{
 const lower = text.toLowerCase();
 if (/^day\s+\d+|^week\s+\d+|^shipped|^ship log|mrr|churn|metrics|retention/.test(lower)) return'recap';
 if (/how to|tutorial|step by step|\d\.\s|how does/.test(lower)) return'howto';
 if (/hot take|unpopular|stop using|actually|the truth|reason/.test(lower)) return'opinion';
 if (text.length > 200 || /\n\n/.test(text)) return'thread';
 return'other';
}
