/**
 * Reply Inbox 数据层
 */

import { getDb, TABLE } from'./db';

export type ReplyStatus ='new'|'drafted'|'handled'|'skipped';

export type Reply = {
 id: string;
 user_id: string;
 parent_tweet_id: string;
 parent_tweet_text: string;
 parent_tweet_url: string | null;
 reply_tweet_id: string;
 reply_author_handle: string | null;
 reply_author_name: string | null;
 reply_author_avatar: string | null;
 reply_text: string;
 reply_metrics: Record<string, number> | null;
 pulled_at: string;
 status: ReplyStatus;
 drafted_response: string | null;
 draft_meta: Record<string, unknown> | null;
 handled_at: string | null;
 handled_draft_id: string | null;
 created_at: string;
 updated_at: string;
};

type RawRow = {
 id: string;
 user_id: string;
 parent_tweet_id: string;
 parent_tweet_text: string;
 parent_tweet_url: string | null;
 reply_tweet_id: string;
 reply_author_handle: string | null;
 reply_author_name: string | null;
 reply_author_avatar: string | null;
 reply_text: string;
 reply_metrics: unknown;
 pulled_at: string;
 status: string;
 drafted_response: string | null;
 draft_meta: unknown;
 handled_at: string | null;
 handled_draft_id: string | null;
 created_at: string;
 updated_at: string;
};

function rowToReply(row: RawRow): Reply {
 return {
 ...row,
 reply_metrics: (row.reply_metrics as Record<string, number> | null) ?? null,
 draft_meta: (row.draft_meta as Record<string, unknown> | null) ?? null,
 status: row.status as ReplyStatus,
 };
}

/**
 * 拉用户最近的 reply inbox
 */
export async function listReplies(
 userId: string,
 opts: { status?: ReplyStatus; limit?: number } = {},
): Promise<Reply[]> {
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
 `SELECT * FROM ${TABLE.replyInbox}
 WHERE ${where}
 ORDER BY pulled_at DESC
 LIMIT $${params.length}`,
 params,
 );
 return r.rows.map(rowToReply);
}

export async function countRepliesByStatus(userId: string): Promise<Record<ReplyStatus, number>> {
 const db = getDb();
 if (!db) {
 return { new: 0, drafted: 0, handled: 0, skipped: 0 };
 }
 const r = await db.query<{ status: string; count: string }>(
 `SELECT status, COUNT(*)::text as count FROM ${TABLE.replyInbox}
 WHERE user_id = $1 GROUP BY status`,
 [userId],
 );
 const counts: Record<ReplyStatus, number> = { new: 0, drafted: 0, handled: 0, skipped: 0 };
 for (const row of r.rows) {
 if (row.status in counts) counts[row.status as ReplyStatus] = parseInt(row.count, 10);
 }
 return counts;
}

export async function updateReplyStatus(
 userId: string,
 replyId: string,
 update: {
 status?: ReplyStatus;
 drafted_response?: string;
 draft_meta?: Record<string, unknown>;
 handled_at?: string;
 },
): Promise<Reply | null> {
 const db = getDb();
 if (!db) return null;

 const sets: string[] = [];
 const params: unknown[] = [];
 let i = 1;

 if (update.status) {
 sets.push(`status = $${i++}`);
 params.push(update.status);
 }
 if (update.drafted_response !== undefined) {
 sets.push(`drafted_response = $${i++}`);
 params.push(update.drafted_response);
 }
 if (update.draft_meta !== undefined) {
 sets.push(`draft_meta = $${i++}::jsonb`);
 params.push(JSON.stringify(update.draft_meta));
 }
 if (update.handled_at) {
 sets.push(`handled_at = $${i++}`);
 params.push(update.handled_at);
 }
 sets.push(`updated_at = now()`);

 if (sets.length === 1) {
 // only updated_at — just return the existing row
 const r = await db.query<RawRow>(
 `SELECT * FROM ${TABLE.replyInbox} WHERE id = $1 AND user_id = $2`,
 [replyId, userId],
 );
 return r.rows.length > 0 ? rowToReply(r.rows[0]) : null;
 }

 params.push(replyId);
 params.push(userId);
 const r = await db.query<RawRow>(
 `UPDATE ${TABLE.replyInbox}
 SET ${sets.join(',')}
 WHERE id = $${i++} AND user_id = $${i++}
 RETURNING *`,
 params,
 );
 return r.rows.length > 0 ? rowToReply(r.rows[0]) : null;
}

/**
 * Sync:拉用户最近 N 条推文的 reply,upsert 进 inbox
 * 已存在 (reply_tweet_id) 的不重复
 */
export async function syncRepliesForUser(
 userId: string,
 handle: string,
 tweetsPerUser: number = 5,
 repliesPerTweet: number = 10,
): Promise<{ new_replies: number; total_checked: number; tweets_scanned: number }> {
 const { runTool } = await import('./tools');

 // 1. 拉最近 N 条 user 推文
 const tweetsResult = await runTool('twitter_get_user_tweets',
 { username: handle, count: String(tweetsPerUser) },
 { userId },
 );
 if (!tweetsResult.ok) {
 throw new Error(tweetsResult.error ||'failed to pull user tweets');
 }
 const tweetsData = tweetsResult.data as any;
 const tweets: any[] =
 tweetsData?.tweets ??
 tweetsData?.data?.user?.result?.timeline_v2?.timeline?.instructions
 ?.flatMap((i: any) => i.entries ?? [])
 ?.map((e: any) => e?.content?.itemContent?.tweet_results?.result?.legacy)
 ?.filter(Boolean) ??
 [];

 if (tweets.length === 0) {
 return { new_replies: 0, total_checked: 0, tweets_scanned: 0 };
 }

 let newReplies = 0;
 let totalChecked = 0;

 const db = getDb();
 if (!db) {
 return { new_replies: 0, total_checked: 0, tweets_scanned: tweets.length };
 }

 for (const t of tweets) {
 const tweetId = t.id_str ?? t.id;
 const tweetText = t.full_text ?? t.text ??'';
 if (!tweetId) continue;

 // 2. 拉这条推文的 replies
 const repliesResult = await runTool('twitter_get_tweet_replies',
 { tweet_id: tweetId, count: String(repliesPerTweet) },
 { userId },
 );
 if (!repliesResult.ok) continue;

 // 3. 解析 replies(深嵌套结构,defensive)
 const repliesData = repliesResult.data as any;
 const replies: any[] = extractRepliesFromTimeline(repliesData);
 totalChecked += replies.length;

 for (const r of replies) {
 if (!r.id_str || r.id_str === tweetId) continue; // skip parent + invalid

 try {
 const ins = await db.query(
 `INSERT INTO ${TABLE.replyInbox}
 (user_id, parent_tweet_id, parent_tweet_text, reply_tweet_id,
 reply_author_handle, reply_author_name, reply_author_avatar,
 reply_text, reply_metrics)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
 ON CONFLICT (reply_tweet_id) DO NOTHING
 RETURNING id`,
 [
 userId,
 tweetId,
 tweetText.slice(0, 500),
 r.id_str,
 r.author_handle ?? r.user?.screen_name ?? null,
 r.author_name ?? r.user?.name ?? null,
 r.author_avatar ?? r.user?.avatar_url ?? null,
 (r.full_text ?? r.text ??'').slice(0, 1000),
 JSON.stringify({
 likes: r.favorite_count ?? 0,
 retweets: r.retweet_count ?? 0,
 replies: r.reply_count ?? 0,
 }),
 ],
 );
 if (ins.rows.length > 0) newReplies++;
 } catch (e) {
 // skip duplicate / error
 }
 }
 }

 return { new_replies: newReplies, total_checked: totalChecked, tweets_scanned: tweets.length };
}

function extractRepliesFromTimeline(data: any): any[] {
 try {
 const instructions =
 data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ??
 data?.data?.tweetResult?.timeline_response?.timeline?.instructions ??
 [];
 const entries: any[] = [];
 for (const instr of instructions) {
 if (instr.type ==='TimelineAddEntries'&& Array.isArray(instr.entries)) {
 entries.push(...instr.entries);
 }
 }
 const replies: any[] = [];
 for (const entry of entries) {
 const result =
 entry?.content?.itemContent?.tweet_results?.result ??
 entry?.content?.tweet_results?.result;
 if (!result) continue;
 const legacy = result.legacy ?? result.tweet?.legacy;
 if (!legacy) continue;
 // Skip the parent tweet itself
 if (legacy.conversation_id_str && legacy.id_str === legacy.conversation_id_str) continue;
 // Skip retweets / quote tweets-of-quotes
 if (legacy.retweeted_status_id_str) continue;
 replies.push({
 ...legacy,
 author_handle: legacy.user?.screen_name ?? result.core?.user_results?.result?.legacy?.screen_name,
 author_name: legacy.user?.name ?? result.core?.user_results?.result?.legacy?.name,
 author_avatar: legacy.user?.avatar_url,
 });
 }
 return replies;
 } catch {
 return [];
 }
}
