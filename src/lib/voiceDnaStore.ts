/**
 * Voice DNA 数据持久化 + 加载 + 注入到 system prompt
 */

import { getDb, TABLE } from'./db';
import {
 type VoiceDna,
 type VoiceDnaFeatures,
 featuresToPromptText,
 sampleTweetsToPromptText,
} from'./voiceDna';

type RawRow = {
 user_id: string;
 source_type: string;
 source_meta: unknown;
 source_tweet_count: number | null;
 features: unknown;
 confidence: number | null;
 sample_tweets: unknown;
 version: number | null;
 last_extracted_at: string | null;
 outdated_at: string | null;
 created_at: string;
 updated_at: string;
};

/**
 * 加载用户的 voice DNA(忽略 outdated_at 标记的)
 */
export async function loadUserDna(userId: string): Promise<VoiceDna | null> {
 const db = getDb();
 if (!db) return null;
 try {
 const r = await db.query<RawRow>(
 `SELECT user_id, source_type, source_meta, source_tweet_count, features, confidence, sample_tweets,
 version, last_extracted_at, outdated_at, created_at, updated_at
 FROM ${TABLE.voiceDna}
 WHERE user_id = $1 AND outdated_at IS NULL
 ORDER BY version DESC
 LIMIT 1`,
 [userId],
 );
 if (r.rows.length === 0) return null;
 const row = r.rows[0];
 return {
 user_id: row.user_id,
 source_type: row.source_type as VoiceDna['source_type'],
 source_meta: (row.source_meta as Record<string, unknown> | null) ?? null,
 source_tweet_count: row.source_tweet_count ?? 0,
 features: row.features as VoiceDnaFeatures,
 confidence: row.confidence ?? 0.5,
 sample_tweets: (row.sample_tweets as string[] | null) ?? null,
 version: row.version ?? 1,
 last_extracted_at: row.last_extracted_at ?? new Date().toISOString(),
 outdated_at: row.outdated_at,
 created_at: row.created_at,
 updated_at: row.updated_at,
 };
 } catch (e) {
 console.error('[voiceDnaStore] load failed:', e);
 return null;
 }
}

export type SaveDnaInput = {
 user_id: string;
 source_type: VoiceDna['source_type'];
 source_meta: Record<string, unknown> | null;
 source_tweet_count: number;
 features: VoiceDnaFeatures;
 confidence: number;
 sample_tweets: string[];
};

/**
 * 存储/更新 voice DNA(version 自增,旧版本保留)
 */
export async function saveUserDna(input: SaveDnaInput): Promise<VoiceDna> {
 const db = getDb();
 if (!db) throw new Error('DB not configured');

 // 标记旧版本为 outdated
 await db.query(
 `UPDATE ${TABLE.voiceDna} SET outdated_at = now() WHERE user_id = $1 AND outdated_at IS NULL`,
 [input.user_id],
 );

 // 取最新 version
 const v = await db.query<{ max_version: number | null }>(
 `SELECT MAX(version) as max_version FROM ${TABLE.voiceDna} WHERE user_id = $1`,
 [input.user_id],
 );
 const nextVersion = (v.rows[0]?.max_version ?? 0) + 1;

 const r = await db.query<RawRow>(
 `INSERT INTO ${TABLE.voiceDna}
 (user_id, source_type, source_meta, source_tweet_count, features, confidence, sample_tweets, version)
 VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7::jsonb, $8)
 RETURNING *`,
 [
 input.user_id,
 input.source_type,
 input.source_meta ? JSON.stringify(input.source_meta) : null,
 input.source_tweet_count,
 JSON.stringify(input.features),
 input.confidence,
 JSON.stringify(input.sample_tweets),
 nextVersion,
 ],
 );

 const row = r.rows[0];
 return {
 user_id: row.user_id,
 source_type: row.source_type as VoiceDna['source_type'],
 source_meta: (row.source_meta as Record<string, unknown> | null) ?? null,
 source_tweet_count: row.source_tweet_count ?? 0,
 features: row.features as VoiceDnaFeatures,
 confidence: row.confidence ?? 0.5,
 sample_tweets: (row.sample_tweets as string[] | null) ?? null,
 version: row.version ?? 1,
 last_extracted_at: row.last_extracted_at ?? new Date().toISOString(),
 outdated_at: row.outdated_at,
 created_at: row.created_at,
 updated_at: row.updated_at,
 };
}

/**
 * 用户主动标记"过期"— 不会删除,只标记
 */
export async function markDnaOutdated(userId: string): Promise<void> {
 const db = getDb();
 if (!db) return;
 await db.query(
 `UPDATE ${TABLE.voiceDna} SET outdated_at = now() WHERE user_id = $1 AND outdated_at IS NULL`,
 [userId],
 );
}

/**
 * 把 DNA 格式化为可注入 system prompt 的文本
 */
export function dnaToPromptSection(dna: VoiceDna | null): string {
 if (!dna) return'';

 const samples = sampleTweetsToPromptText(dna.sample_tweets);
 const features = featuresToPromptText(dna.features);

 return [
 `\n## 用户写作 DNA (来源: ${dna.source_type}, 置信度: ${(dna.confidence * 100).toFixed(0)}%, version: ${dna.version})`,'',
 features,'',
 samples ? `**代表推文**:\n${samples}` :'','','**写作时严格遵循这个 DNA**。允许偶尔突破,但不能脱离这个调性。DNA 是软目标,不是硬规则。',
 ]
 .filter((s) => s.length > 0)
 .join('\n');
}
