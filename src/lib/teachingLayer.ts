/**
 * Teaching Layer:从 outcomes + health report 提取 insight
 */

import { deepseek } from'./llm';
import { getCachedOutcomesSummary } from'./outcomesStore';
import { getLatestHealthReport } from'./accountHealth';
import { getDb, TABLE } from'./db';

export type TeachingInsight = {
 id: string;
 type:'pattern'|'tip'|'warning';
 text: string;
 evidence: string;
 signature_seed: string;
};

const TEACHING_PROMPT = `你是用户账号的"私人增长教练"。基于 outcomes pattern + 最新健康报告,生成 1-2 条 insight。

## 真实性自审
1. **不堆通用建议** —"好内容互动高"不算 insight
2. **必须用户 specific** — 引用具体数据
3. **可执行** —"下次发 X 时,试试 Y"4. **简短** — 每条 ≤ 2 句话

## 输出
{
 insights: [
 { type:'pattern'|'tip'|'warning', text, evidence, signature_seed }
 ]
}

只返回 JSON。`;

export async function generateTeachingInsights(userId: string): Promise<TeachingInsight[]> {
 const [outcomes, latestHealth, dismissed] = await Promise.all([
 getCachedOutcomesSummary(userId),
 getLatestHealthReport(userId),
 getDismissedSignatures(userId),
 ]);

 if (
 (!outcomes || outcomes.insufficient_data) &&
 !latestHealth
 ) {
 return [];
 }

 // Build input
 const outcomesBlock =
 outcomes && !outcomes.insufficient_data && outcomes.patterns.length > 0
 ? outcomes.patterns.map((p) => `- ${p.pattern} (${p.confidence})`).join('\n')
 :'(no patterns)';

 const healthBlock = latestHealth
 ? `最佳时段: ${latestHealth.metrics.best_time_slot?.day ??'?'} ${latestHealth.metrics.best_time_slot?.hour_range ??'?'}\n最佳类型: ${latestHealth.metrics.best_type?.type ??'?'}\n最差类型: ${latestHealth.metrics.worst_type?.type ??'?'}\n平均互动: ${latestHealth.metrics.avg_engagement.toFixed(1)}`
 :'(no health)';

 try {
 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: TEACHING_PROMPT },
 {
 role:'user',
 content: `Outcomes:\n${outcomesBlock}\n\nHealth:\n${healthBlock}`,
 },
 ],
 temperature: 0.4,
 max_tokens: 8000,
 });
 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
 const parsed = JSON.parse(json);
 if (!Array.isArray(parsed.insights)) return [];

 return parsed.insights
 .slice(0, 2)
 .filter((i: any) => !dismissed.includes(i.signature_seed))
 .map((i: any, idx: number) => ({
 id: `${userId}_${idx}_${Date.now()}`,
 type: i.type ??'tip',
 text: String(i.text ??''),
 evidence: String(i.evidence ??''),
 signature_seed: String(i.signature_seed ?? `default_${idx}`),
 }));
 } catch {
 // Fallback: just use outcomes directly
 if (outcomes && !outcomes.insufficient_data) {
 return outcomes.patterns.slice(0, 1).map((p, idx) => ({
 id: `${userId}_fallback_${idx}`,
 type:'pattern'as const,
 text: p.pattern,
 evidence: p.evidence,
 signature_seed: `pattern:${p.pattern.slice(0, 30)}`,
 })).filter((i) => !dismissed.includes(i.signature_seed));
 }
 return [];
 }
}

export async function dismissInsight(userId: string, signature: string): Promise<void> {
 const db = getDb();
 if (!db) return;
 await db.query(
 `INSERT INTO ${TABLE.dismissedInsights} (user_id, insight_signature, insight_text)
 VALUES ($1, $2, $3)
 ON CONFLICT (user_id, insight_signature) DO NOTHING`,
 [userId, signature,''],
 );
}

async function getDismissedSignatures(userId: string): Promise<string[]> {
 const db = getDb();
 if (!db) return [];
 const r = await db.query<{ insight_signature: string }>(
 `SELECT insight_signature FROM ${TABLE.dismissedInsights} WHERE user_id = $1`,
 [userId],
 );
 return r.rows.map((row) => row.insight_signature);
}
