/**
 * Outcomes Loop:用户标记"用了"agent 推文 → 粘 URL → 拉 metrics → 学 pattern
 */

import { getDb, TABLE } from'./db';

export type UserTweetStatus ='pending'|'pulled'|'failed'|'skipped'|'demo';
export type UserTweetSource ='agent_draft'|'user_wrote'|'mixed';

export type TweetMetrics = {
 likes: number;
 retweets: number;
 replies: number;
 quotes: number;
 impressions: number;
 bookmarks: number;
 pulled_at: string;
};

export type UserTweet = {
 id: string;
 user_id: string;
 tweet_id: string | null;
 tweet_url: string | null;
 tweet_text: string;
 source: UserTweetSource;
 draft_session_id: string | null;
 draft_message_id: string | null;
 marked_at: string;
 marked_published_at: string | null;
 metrics: TweetMetrics | null;
 metrics_pulled_at: string | null;
 metrics_version: number;
 status: UserTweetStatus;
 last_error: string | null;
};

/**
 * 标记 agent 草稿为"用了"*/
export async function markTweetAsUsed(
 userId: string,
 args: {
 tweet_text: string;
 source: UserTweetSource;
 draft_session_id?: string | null;
 draft_message_id?: string | null;
 },
): Promise<UserTweet> {
 const db = getDb();
 if (!db) throw new Error('DB not configured');

 // Only accept valid UUIDs for foreign-key-like fields; otherwise null
 const isUuid = (s: string | null | undefined): boolean =>
 !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

 const r = await db.query<RawRow>(
 `INSERT INTO ${TABLE.userTweets}
 (user_id, tweet_text, source, draft_session_id, draft_message_id, status)
 VALUES ($1, $2, $3, $4, $5,'pending')
 RETURNING *`,
 [
 userId,
 args.tweet_text,
 args.source,
 isUuid(args.draft_session_id) ? args.draft_session_id : null,
 isUuid(args.draft_message_id) ? args.draft_message_id : null,
 ],
 );
 return rowToUserTweet(r.rows[0]);
}

/**
 * 粘 URL(可能 1 周后才粘)
 */
export async function pasteTweetUrl(
 userId: string,
 userTweetId: string,
 tweetUrl: string,
): Promise<UserTweet> {
 const db = getDb();
 if (!db) throw new Error('DB not configured');

 // Extract tweet_id from URL
 const tweetId = extractTweetId(tweetUrl);

 const r = await db.query<RawRow>(
 `UPDATE ${TABLE.userTweets}
 SET tweet_url = $1, tweet_id = $2, updated_at = now()
 WHERE id = $3 AND user_id = $4
 RETURNING *`,
 [tweetUrl, tweetId, userTweetId, userId],
 );
 if (r.rows.length === 0) {
 throw new Error('UserTweet not found or not owned by user');
 }
 return rowToUserTweet(r.rows[0]);
}

/**
 * 更新 metrics
 */
export async function updateTweetMetrics(
 userTweetId: string,
 metrics: TweetMetrics,
 status: UserTweetStatus ='pulled',
): Promise<void> {
 const db = getDb();
 if (!db) return;
 await db.query(
 `UPDATE ${TABLE.userTweets}
 SET metrics = $1::jsonb, metrics_pulled_at = $2, metrics_version = metrics_version + 1,
 status = $3, last_error = NULL, updated_at = now()
 WHERE id = $4`,
 [JSON.stringify(metrics), metrics.pulled_at, status, userTweetId],
 );
}

/**
 * 标记失败
 */
export async function markTweetFailed(
 userTweetId: string,
 error: string,
): Promise<void> {
 const db = getDb();
 if (!db) return;
 await db.query(
 `UPDATE ${TABLE.userTweets}
 SET status ='failed', last_error = $1, updated_at = now()
 WHERE id = $2`,
 [error, userTweetId],
 );
}

/**
 * 标记发布(用户真发了)
 */
export async function markTweetPublished(
 userId: string,
 userTweetId: string,
): Promise<void> {
 const db = getDb();
 if (!db) return;
 await db.query(
 `UPDATE ${TABLE.userTweets}
 SET marked_published_at = now(), updated_at = now()
 WHERE id = $1 AND user_id = $2`,
 [userTweetId, userId],
 );
}

/**
 * 列出用户的 user tweets
 */
export async function listUserTweets(
 userId: string,
 opts: { status?: UserTweetStatus; limit?: number } = {},
): Promise<UserTweet[]> {
 const db = getDb();
 if (!db) return [];
 const params: unknown[] = [userId];
 let where = `user_id = $1`;
 if (opts.status) {
 params.push(opts.status);
 where += ` AND status = $${params.length}`;
 }
 params.push(opts.limit ?? 50);
 const r = await db.query<RawRow>(
 `SELECT * FROM ${TABLE.userTweets}
 WHERE ${where}
 ORDER BY marked_at DESC
 LIMIT $${params.length}`,
 params,
 );
 return r.rows.map(rowToUserTweet);
}

/**
 * 拉所有 pending ≥ 24h(用于 cron)
 */
export async function listPendingOldTweets(
 olderThanHours: number = 24,
): Promise<UserTweet[]> {
 const db = getDb();
 if (!db) return [];
 const r = await db.query<RawRow>(
 `SELECT * FROM ${TABLE.userTweets}
 WHERE status ='pending'AND tweet_url IS NOT NULL
 AND marked_at < now() - interval'${olderThanHours} hours'ORDER BY marked_at ASC
 LIMIT 100`,
 );
 return r.rows.map(rowToUserTweet);
}

// ── helpers ──

function extractTweetId(url: string): string | null {
 // Match x.com/.../status/123 or twitter.com/.../status/123
 const m = url.match(/\/status\/(\d+)/);
 return m ? m[1] : null;
}

type RawRow = {
 id: string;
 user_id: string;
 tweet_id: string | null;
 tweet_url: string | null;
 tweet_text: string;
 source: string;
 draft_session_id: string | null;
 draft_message_id: string | null;
 marked_at: string;
 marked_published_at: string | null;
 metrics: unknown;
 metrics_pulled_at: string | null;
 metrics_version: number | null;
 status: string;
 last_error: string | null;
};

function rowToUserTweet(row: RawRow): UserTweet {
 return {
 id: row.id,
 user_id: row.user_id,
 tweet_id: row.tweet_id,
 tweet_url: row.tweet_url,
 tweet_text: row.tweet_text,
 source: row.source as UserTweetSource,
 draft_session_id: row.draft_session_id,
 draft_message_id: row.draft_message_id,
 marked_at: row.marked_at,
 marked_published_at: row.marked_published_at,
 metrics: (row.metrics as TweetMetrics | null) ?? null,
 metrics_pulled_at: row.metrics_pulled_at,
 metrics_version: row.metrics_version ?? 0,
 status: row.status as UserTweetStatus,
 last_error: row.last_error,
 };
}
