/**
 * Outcomes summary 缓存到 vp_user_preferences (scope='insights')
 */

import { getDb, TABLE } from'./db';
import type { OutcomesSummary } from'./outcomesAnalysis';

const KEY = (userId: string, weekIso: string) =>
 `outcomes_summary_${userId.slice(0, 8)}_${weekIso}`;

function currentWeekIso(): string {
 const now = new Date();
 const day = now.getUTCDay();
 const monday = new Date(now);
 monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
 return monday.toISOString().slice(0, 10);
}

export async function getCachedOutcomesSummary(
 userId: string,
 weekIso?: string,
): Promise<OutcomesSummary | null> {
 const db = getDb();
 if (!db) return null;
 const wk = weekIso ?? currentWeekIso();
 try {
 const r = await db.query<{ value: unknown }>(
 `SELECT value FROM ${TABLE.preferences}
 WHERE user_id = $1 AND key = $2 AND scope ='insights'`,
 [userId, KEY(userId, wk)],
 );
 return (r.rows[0]?.value as OutcomesSummary | null) ?? null;
 } catch {
 return null;
 }
}

export async function saveOutcomesSummary(
 userId: string,
 summary: OutcomesSummary,
 weekIso?: string,
): Promise<void> {
 const db = getDb();
 if (!db) return;
 const wk = weekIso ?? currentWeekIso();
 await db.query(
 `INSERT INTO ${TABLE.preferences} (user_id, key, value, scope)
 VALUES ($1, $2, $3::jsonb,'insights')
 ON CONFLICT (user_id, key) DO UPDATE
 SET value = EXCLUDED.value, updated_at = now(), last_confirmed_at = now()`,
 [userId, KEY(userId, wk), JSON.stringify(summary)],
 );
}

export async function getOutcomesForPrompt(
 userId: string,
): Promise<string> {
 const summary = await getCachedOutcomesSummary(userId);
 if (!summary) return'';
 if (summary.insufficient_data) return'';
 const { outcomesToPromptText } = await import('./outcomesAnalysis');
 return outcomesToPromptText(summary);
}
