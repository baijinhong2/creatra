/**
 * Tools available to the viralpost agent.
 * Each tool is described in the format DeepSeek's function-calling expects.
 *
 * All API credentials are read from `vp_user_preferences` (Supabase KV) FIRST,
 * then fall back to `process.env.*`. This means the user can paste a new
 * GitHub token (or rotate X cookies) right in the chat, and the LLM picks
 * it up via the `remember_preference` tool without redeployment.
 */

import type { ToolDefinition } from './llm';
import { deepseek } from './llm';
import { getDb, TABLE } from './db';

// ─── Tool context / result types ─────────────────────────────────────────

type ToolContext = {
  userId: string;
  conversationId?: string;
};

type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

// ─── Preference helpers (Supabase vp_user_preferences, KV model) ────────

async function readPref(
  userId: string,
  key: string,
): Promise<unknown | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const r = await db.query<{ value: unknown }>(
      `SELECT value FROM ${TABLE.preferences} WHERE user_id = $1 AND key = $2`,
      [userId, key],
    );
    return r.rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function writePref(
  userId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await db.query(
      `INSERT INTO ${TABLE.preferences} (user_id, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [userId, key, JSON.stringify(value)],
    );
    return true;
  } catch (e) {
    console.error('[prefs] write failed', key, e);
    return false;
  }
}

async function getCred(
  userId: string,
  prefKey: string,
  envKey: string,
): Promise<string | null> {
  const fromPref = await readPref(userId, prefKey);
  if (typeof fromPref === 'string' && fromPref.length > 0) return fromPref;
  const env = process.env[envKey];
  return env && env.length > 0 ? env : null;
}

// ─── Tool implementations ────────────────────────────────────────────────

async function tavilySearch(
  userId: string,
  query: string,
  maxResults = 5,
): Promise<ToolResult> {
  const apiKey = await getCred(userId, 'tavily.key', 'TAVILY_API_KEY');
  if (!apiKey) {
    return {
      ok: false,
      error: 'No Tavily key. Tell the user to add one in Sources, or call remember_preference(key="tavily.key", value="tvly-...").',
    };
  }
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: true,
        search_depth: 'basic',
      }),
    });
    if (!r.ok) {
      return { ok: false, error: `Tavily HTTP ${r.status}` };
    }
    const data = (await r.json()) as {
      results?: Array<{ title: string; url: string; content: string }>;
      answer?: string;
    };
    return {
      ok: true,
      data: {
        answer: data.answer,
        results: (data.results ?? []).map((rr) => ({
          title: rr.title,
          url: rr.url,
          snippet: rr.content.slice(0, 300),
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Image-only search via Tavily's `include_images: true` mode. Used by the
 * daily-tweet skill (skill 5) when the planned tweet needs a hero image —
 * if the image can be sourced from the open web, fetch the URLs so the
 * user can grab them; otherwise the agent falls back to writing a
 * description for the user to provide.
 */
async function tavilyImageSearch(
  userId: string,
  query: string,
  maxResults = 6,
): Promise<ToolResult> {
  const apiKey = await getCred(userId, 'tavily.key', 'TAVILY_API_KEY');
  if (!apiKey) {
    return {
      ok: false,
      error: 'No Tavily key. Tell the user to add one in Sources, or call remember_preference(key="tavily.key", value="tvly-...").',
    };
  }
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_images: true,
        search_depth: 'basic',
      }),
    });
    if (!r.ok) {
      return { ok: false, error: `Tavily HTTP ${r.status}` };
    }
    const data = (await r.json()) as { images?: Array<{ url: string; description?: string }> };
    const images = (data.images ?? [])
      .filter((img) => typeof img.url === 'string' && img.url.length > 0)
      .slice(0, maxResults)
      .map((img) => ({
        url: img.url,
        description: img.description ?? '',
      }));
    return { ok: true, data: { count: images.length, images } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function githubRead(
  userId: string,
  owner: string,
  repo: string,
  path = 'README.md',
): Promise<ToolResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'viralpost-agent',
  };
  const token = await getCred(userId, 'github.token', 'GITHUB_TOKEN');
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers },
    );
    if (!r.ok) {
      return { ok: false, error: `GitHub API HTTP ${r.status}` };
    }
    const data = (await r.json()) as {
      content?: string;
      encoding?: string;
      name?: string;
    };
    if (data.encoding === 'base64' && data.content) {
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      return {
        ok: true,
        data: {
          repo: `${owner}/${repo}`,
          path: data.name ?? path,
          content: decoded.slice(0, 4000),
          truncated: decoded.length > 4000,
          totalLength: decoded.length,
        },
      };
    }
    return { ok: false, error: 'Unexpected response shape' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function twitterApi(
  userId: string,
  endpoint: 'search' | 'user-tweets',
  params: Record<string, string>,
): Promise<ToolResult> {
  const authToken = await getCred(userId, 'x.auth_token', 'X_AUTH_TOKEN');
  const ct0 = await getCred(userId, 'x.ct0', 'X_CT0');
  if (!authToken || !ct0) {
    return {
      ok: false,
      error:
        'X cookies not configured. Tell the user to add X_AUTH_TOKEN + X_CT0 in Sources, or via remember_preference(key="x.auth_token" / "x.ct0", value=...).',
    };
  }

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    Authorization:
      'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    Cookie: `auth_token=${authToken}; ct0=${ct0}`,
    'X-Csrf-Token': ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'Content-Type': 'application/json',
  };

  try {
    let data: unknown;
    if (endpoint === 'user-tweets') {
      const username = params.username;
      if (!username) return { ok: false, error: 'username required' };
      const userIdRes = await fetch(
        `https://api.twitter.com/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${encodeURIComponent(
          JSON.stringify({ screen_name: username, withSafetyModeUserFields: true }),
        )}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      const userIdJson = (await userIdRes.json()) as {
        data?: { user?: { result?: { rest_id?: string } } };
      };
      const restId = userIdJson.data?.user?.result?.rest_id;
      if (!restId) return { ok: false, error: 'User not found' };

      const tweetsRes = await fetch(
        `https://api.twitter.com/graphql/E3opETHurmVJflFsUBVuQ/UserTweets?variables=${encodeURIComponent(
          JSON.stringify({
            userId: restId,
            count: Number(params.count ?? 10),
            includePromotedContent: false,
            withQuickPromoteEligibilityTweetFields: true,
            withVoice: true,
            withV2Timeline: true,
          }),
        )}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      data = await tweetsRes.json();
    } else {
      const query = params.query;
      if (!query) return { ok: false, error: 'query required' };
      const searchRes = await fetch(
        `https://api.twitter.com/graphql/gkjsKepM6gl_HmFWoWKfgg/SearchTimeline?variables=${encodeURIComponent(
          JSON.stringify({
            rawQuery: query,
            count: Number(params.count ?? 20),
            querySource: 'typed_query',
            product: 'Latest',
          }),
        )}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      data = await searchRes.json();
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fetch replies under a single tweet. Uses X's SearchTimeline GraphQL with a
 * `conversation_id:{tweetId}` filter, which returns the full conversation
 * thread (parent + replies). Skill 6 ("comment triage") uses this to surface
 * the comments on the user's own tweets.
 */
async function twitterGetReplies(
  userId: string,
  tweetId: string,
  count = 30,
): Promise<ToolResult> {
  const authToken = await getCred(userId, 'x.auth_token', 'X_AUTH_TOKEN');
  const ct0 = await getCred(userId, 'x.ct0', 'X_CT0');
  if (!authToken || !ct0) {
    return {
      ok: false,
      error:
        'X cookies not configured. Add X_AUTH_TOKEN + X_CT0 in Sources.',
    };
  }
  if (!tweetId || !/^\d{5,30}$/.test(tweetId)) {
    return { ok: false, error: 'tweet_id must be a numeric X tweet id' };
  }

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    Authorization:
      'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    Cookie: `auth_token=${authToken}; ct0=${ct0}`,
    'X-Csrf-Token': ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'Content-Type': 'application/json',
  };

  try {
    const r = await fetch(
      `https://api.twitter.com/graphql/gkjsKepM6gl_HmFWoWKfgg/SearchTimeline?variables=${encodeURIComponent(
        JSON.stringify({
          rawQuery: `conversation_id:${tweetId}`,
          count,
          querySource: 'typed_query',
          product: 'Latest',
        }),
      )}`,
      { headers, signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) return { ok: false, error: `X GraphQL HTTP ${r.status}` };
    const data = await r.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function suggestSimilarCreators(
  accountContext: string,
  language: 'zh' | 'en' = 'zh',
): Promise<ToolResult> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return { ok: false, error: 'DEEPSEEK_API_KEY not set' };
  }
  const prompt =
    language === 'zh'
      ? `基于以下账号定位,推荐 10 个相似/对标 X(Twitter)账号。

账号定位:${accountContext}

要求:
- 优先推荐真人创作者,不要官方品牌账号
- 推荐不同量级的账号(几个大 V + 几个成长中的)
- 给出每个账号的 @handle、一句话简介、为什么值得对标
- 直接输出 JSON 数组,不要 markdown

格式:
[{"handle":"@xxx","bio":"一句话简介","why":"为什么对标","followerRange":"1k-10k|10k-100k|100k+"}]`
      : `Recommend 10 similar/benchmark X (Twitter) accounts based on the following account positioning.

Positioning: ${accountContext}

Requirements:
- Prioritize real creators, not official brand accounts
- Mix follower sizes (a few big accounts + several growing ones)
- For each: @handle, one-line bio, why they're a good benchmark, follower range
- Output raw JSON array, no markdown

Format:
[{"handle":"@xxx","bio":"one-line bio","why":"why benchmark","followerRange":"1k-10k|10k-100k|100k+"}]`;

  try {
    const r = await deepseek.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant that recommends X (Twitter) accounts. Output strictly valid JSON only — no markdown fences, no explanations.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500,
    });
    const content = (r as any).choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: 'Empty LLM response' };
    try {
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed)
        ? parsed
        : (parsed.suggestions ?? parsed.creators ?? []);
      return { ok: true, data: list };
    } catch {
      return { ok: false, error: 'Invalid JSON from LLM' };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function rememberPreference(
  userId: string,
  key: string,
  value: unknown,
): Promise<ToolResult> {
  // Trim whitespace if value is a string.
  const clean =
    typeof value === 'string' ? value.trim() : value;

  // Pre-flight conflict check: if the key exists with a different value,
  // tell the agent so it can decide whether to overwrite.
  const db = getDb();
  let oldValue: unknown = null;
  let isConflict = false;
  if (db) {
    try {
      const r = await db.query<{ value: unknown }>(
        `SELECT value FROM ${TABLE.preferences} WHERE user_id = $1 AND key = $2`,
        [userId, key],
      );
      oldValue = r.rows[0]?.value ?? null;
      if (oldValue !== null && JSON.stringify(oldValue) !== JSON.stringify(clean)) {
        isConflict = true;
      }
    } catch {
      // ignore preflight errors
    }
  }

  const ok = await writePref(userId, key, clean);
  if (!ok) {
    return {
      ok: false,
      error: 'Failed to save (DB unavailable or invalid value).',
    };
  }
  return {
    ok: true,
    data: {
      key,
      saved: true,
      is_update: oldValue !== null,
      is_conflict: isConflict,
      old_value:
        isConflict && !/\.(token|key|secret|auth_token|ct0|password)$/i.test(key)
          ? oldValue
          : isConflict
          ? '[REDACTED]'
          : null,
      hint: isConflict
        ? 'This key had a different value. The new value replaced it. If the user wanted both, ask whether to keep the old one or treat it as superseded.'
        : null,
    },
  };
}

async function readPreferencesTool(
  userId: string,
  options: { keys?: string[]; scopes?: string[] } = {},
): Promise<ToolResult> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DB not available' };
  try {
    const { keys, scopes } = options;
    // Three modes:
    //   keys=[...] only                 → specific keys
    //   scopes=[...] only               → by memory scope
    //   both                             → intersection
    //   neither                          → all (default)
    if (keys && keys.length > 0) {
      const r = await db.query<{
        key: string; value: unknown; updated_at: unknown; scope: string;
        last_used_at: Date | null; last_confirmed_at: Date; confidence: number;
      }>(
        `SELECT key, value, updated_at, scope, last_used_at, last_confirmed_at, confidence
         FROM ${TABLE.preferences}
         WHERE user_id = $1 AND key = ANY($2::text[])`,
        [userId, keys],
      );
      // bump last_used for returned keys
      const returnedKeys = r.rows.map((row) => row.key);
      if (returnedKeys.length > 0) {
        await db.query(
          `UPDATE ${TABLE.preferences} SET last_used_at = now()
           WHERE user_id = $1 AND key = ANY($2::text[])`,
          [userId, returnedKeys],
        );
      }
      return { ok: true, data: redactRows(r.rows) };
    }
    if (scopes && scopes.length > 0) {
      const r = await db.query<{
        key: string; value: unknown; updated_at: unknown; scope: string;
        last_used_at: Date | null; last_confirmed_at: Date; confidence: number;
      }>(
        `SELECT key, value, updated_at, scope, last_used_at, last_confirmed_at, confidence
         FROM ${TABLE.preferences}
         WHERE user_id = $1 AND scope = ANY($2::text[])
         ORDER BY scope, key`,
        [userId, scopes],
      );
      const returnedKeys = r.rows.map((row) => row.key);
      if (returnedKeys.length > 0) {
        await db.query(
          `UPDATE ${TABLE.preferences} SET last_used_at = now()
           WHERE user_id = $1 AND key = ANY($2::text[])`,
          [userId, returnedKeys],
        );
      }
      return {
        ok: true,
        data: { scope_filter: scopes, count: r.rows.length, items: redactRows(r.rows) },
      };
    }
    // no filter — return all
    const r = await db.query<{
      key: string; value: unknown; updated_at: unknown; scope: string;
      last_used_at: Date | null; last_confirmed_at: Date; confidence: number;
    }>(
      `SELECT key, value, updated_at, scope, last_used_at, last_confirmed_at, confidence
       FROM ${TABLE.preferences}
       WHERE user_id = $1 ORDER BY scope, key`,
      [userId],
    );
    const returnedKeys = r.rows.map((row) => row.key);
    if (returnedKeys.length > 0) {
      await db.query(
        `UPDATE ${TABLE.preferences} SET last_used_at = now()
         WHERE user_id = $1 AND key = ANY($2::text[])`,
        [userId, returnedKeys],
      );
    }
    return { ok: true, data: { count: r.rows.length, items: redactRows(r.rows) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function redactRows(
  rows: Array<{
    key: string;
    value: unknown;
    updated_at: unknown;
    scope: string;
    last_used_at: Date | null;
    last_confirmed_at: Date;
    confidence: number;
  }>,
) {
  return rows.map((row) => {
    const isSecretKey =
      /\.(token|key|secret|auth_token|ct0|password)$/i.test(row.key);
    return {
      key: row.key,
      scope: row.scope,
      confidence: row.confidence,
      value: isSecretKey
        ? row.value
          ? '[REDACTED: set]'
          : '[not set]'
        : row.value,
      last_used_at: row.last_used_at ? String(row.last_used_at) : null,
      last_confirmed_at: String(row.last_confirmed_at),
    };
  });
}

// ─── Insights (user-accumulated content) ──────────────────────────────────
//
// The agent captures "沉淀" — reflections, project breakdowns, methods,
// discoveries, sharings, fragments — into vp_insights. Daily-content skill
// (skill 5) reads from this table to anchor tweets in real user thinking.

const INSIGHT_KINDS = new Set([
  'reflection',
  'project_breakdown',
  'method',
  'discovery',
  'sharing',
  'fragment',
]);

type InsightRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  tags: string[] | null;
  source_conversation_id: string | null;
  metadata: unknown;
  created_at: string;
};

async function saveInsight(
  userId: string,
  conversationId: string | undefined,
  args: {
    kind: string;
    title: string;
    body: string;
    tags?: string[];
  },
): Promise<ToolResult> {
  const kind = String(args.kind ?? '').trim();
  const title = String(args.title ?? '').trim();
  const body = String(args.body ?? '').trim();
  if (!INSIGHT_KINDS.has(kind)) {
    return { ok: false, error: `kind must be one of: ${[...INSIGHT_KINDS].join(', ')}` };
  }
  if (!title) return { ok: false, error: 'title required' };
  if (!body) return { ok: false, error: 'body required' };
  if (title.length > 200) return { ok: false, error: 'title too long (≤200 chars)' };
  if (body.length > 20_000) return { ok: false, error: 'body too long (≤20k chars)' };

  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === 'string').slice(0, 20).map((t) => t.slice(0, 60))
    : [];

  const db = getDb();
  if (!db) return { ok: false, error: 'DB not available' };
  try {
    const r = await db.query<{ id: string }>(
      `INSERT INTO ${TABLE.insights}
        (user_id, kind, title, body, tags, source_conversation_id)
       VALUES ($1, $2, $3, $4, $5::text[], $6::uuid)
       RETURNING id`,
      [
        userId,
        kind,
        title,
        body,
        tags,
        conversationId ?? null,
      ],
    );
    return {
      ok: true,
      data: {
        id: r.rows[0]?.id,
        kind,
        title,
        saved: true,
        // Confirmation for the agent to show the user
        message: `已沉淀一条 ${kind}: 《${title}》(id=${r.rows[0]?.id})`,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function listInsights(
  userId: string,
  args: {
    kind?: string;
    q?: string;
    limit?: number;
  } = {},
): Promise<ToolResult> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DB not available' };
  const kind = args.kind?.trim() || null;
  const q = args.q?.trim() || null;
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
  if (kind && !INSIGHT_KINDS.has(kind)) {
    return { ok: false, error: `kind must be one of: ${[...INSIGHT_KINDS].join(', ')}` };
  }
  try {
    const params: unknown[] = [userId];
    let where = 'user_id = $1';
    if (kind) {
      params.push(kind);
      where += ` AND kind = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (title ILIKE $${params.length} OR body ILIKE $${params.length})`;
    }
    params.push(limit);
    const r = await db.query<InsightRow>(
      `SELECT id, user_id, kind, title, body, tags, source_conversation_id, metadata, created_at
       FROM ${TABLE.insights}
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return {
      ok: true,
      data: {
        count: r.rows.length,
        insights: r.rows,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function deleteInsight(userId: string, id: string): Promise<ToolResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'id must be a uuid' };
  }
  const db = getDb();
  if (!db) return { ok: false, error: 'DB not available' };
  try {
    const r = await db.query(
      `DELETE FROM ${TABLE.insights} WHERE id = $1::uuid AND user_id = $2`,
      [id, userId],
    );
    if (r.rowCount === 0) return { ok: false, error: 'not found' };
    return { ok: true, data: { id, deleted: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function searchInsights(
  userId: string,
  query: string,
  limit = 10,
): Promise<ToolResult> {
  if (!query || !query.trim()) {
    return { ok: false, error: 'query required' };
  }
  // search_insights is currently just list_insights with a text match —
  // exposed as its own tool because the agent should reach for "search my
  // past thinking" semantically distinct from "list recent".
  return listInsights(userId, { q: query.trim(), limit });
}

// ─── Tool registry (definitions + dispatch) ───────────────────────────────

export type ToolName =
  | 'web_search'
  | 'web_image_search'
  | 'github_read'
  | 'twitter_search'
  | 'twitter_get_user_tweets'
  | 'twitter_get_tweet_replies'
  | 'suggest_similar_creators'
  | 'remember_preference'
  | 'read_preferences'
  | 'save_insight'
  | 'list_insights'
  | 'delete_insight'
  | 'search_insights';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'web_search',
    description:
      "Search the web for recent news, trends, and articles. Use when you need to know what is happening in the user's niche right now. Requires a Tavily key (in preferences under 'tavily.key').",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'string', description: 'Optional, default 5' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_image_search',
    description:
      "Image-only web search. Returns image URLs (and a short description) for a query — use this when planning a tweet that needs a hero image and the image is something that can be sourced from the open web (stock photo, screenshot, infographic, etc.). If the planned image must be user-created (custom diagram, personal photo, AI-generated), don't call this — instead, in your tweet plan, write a clear '🖼️ 你需要提供:[description]' line so the user knows what to prepare. Requires Tavily key (preferences 'tavily.key').",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the image should be about' },
        max_results: { type: 'string', description: 'Optional, default 6' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_read',
    description:
      "Read a file from a public GitHub repository. Use to learn what the user is building so their content can naturally reference it (build-in-public strategy). Auth token (if any) is read from preferences 'github.token'.",
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub user or org' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path, default README.md' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'twitter_search',
    description:
      "Search recent tweets on X by keyword. Use to find trending discussions and angle ideas. Requires X cookies (preferences 'x.auth_token' + 'x.ct0').",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'string', description: 'Optional, default 20' },
      },
      required: ['query'],
    },
  },
  {
    name: 'twitter_get_user_tweets',
    description:
      "Fetch the most recent tweets of a given X user. Use to study a benchmark account's recent content. For the user's own tweets, read their handle from preferences 'x.handle' and call this with that handle — the response includes impressions/likes/reposts/replies metrics on each tweet which skill 8 (analysis) needs. Requires X cookies in preferences.",
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'X handle without @' },
        count: { type: 'string', description: 'Optional, default 10' },
      },
      required: ['username'],
    },
  },
  {
    name: 'twitter_get_tweet_replies',
    description:
      "Fetch the conversation thread under a single tweet (parent + replies) by tweet id. Use this for skill 6 (comment triage) — the user has their own recent tweet ids from twitter_get_user_tweets(their_handle), pass each interesting one here, then decide which replies deserve a response and draft one. Requires X cookies.",
    parameters: {
      type: 'object',
      properties: {
        tweet_id: { type: 'string', description: 'Numeric X tweet id' },
        count: { type: 'string', description: 'Optional, default 30' },
      },
      required: ['tweet_id'],
    },
  },
  {
    name: 'suggest_similar_creators',
    description:
      "Given the user's account positioning, recommend 10 similar / benchmark X creators. Use when the user is unsure who to track.",
    parameters: {
      type: 'object',
      properties: {
        account_context: {
          type: 'string',
          description: "The user's account positioning / niche",
        },
        language: { type: 'string', description: '"zh" or "en", default "zh"' },
      },
      required: ['account_context'],
    },
  },
  {
    name: 'remember_preference',
    description:
      "Persist a key/value pair the user wants the agent to remember across sessions. Use when the user shares a personal fact, position, or credential. For secrets (tokens, API keys), use keys ending in '.token', '.key', or '.secret' — values will be redacted in logs and in subsequent read_preferences calls.",
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            "Lowercase dot-separated key, e.g. 'github.token', 'x.auth_token', 'account.niche'",
        },
        value: {
          type: 'string',
          description: 'Value to store (string for most cases)',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'read_preferences',
    description:
      "Read stored preferences. You SHOULD pass `scopes` (one of: 'account', 'voice', 'projects', 'insights', 'tools', 'episodic') so the system only returns the memories relevant to what you're doing — not the whole KV store. You may also pass `keys` for a specific list. Each scope has a clear purpose: 'account' = who/what the account is, 'voice' = how to write, 'projects' = what user is building, 'insights' = user's accumulated thinking (use list_insights for that), 'tools' = credentials and tokens, 'episodic' = past events. Calling this also updates the last_used_at timestamp on the returned rows — that's how memories stay 'fresh' vs. 'cold'.",
    parameters: {
      type: 'object',
      properties: {
        scopes: {
          type: 'array',
          description: 'Optional list of scopes to read. Examples: ["account","voice"] for a tweet; ["projects"] for build-in-public context.',
        },
        keys: {
          type: 'array',
          description: 'Optional list of specific keys to read. Use only when you know exactly which key you need.',
        },
      },
    },
  },
  {
    name: 'save_insight',
    description:
      "Save a piece of the user's accumulated thinking (a reflection, project breakdown, method, discovery, sharing, or raw fragment) to their long-term content library. The daily-content skill draws from this library to anchor tweets in real user thinking — not generic AI filler. Kinds: 'reflection' (感悟), 'project_breakdown' (项目复盘: 起点/过程/发现/优化), 'method' (方法论), 'discovery' (新发现), 'sharing' (优质内容分享), 'fragment' (碎片想法,先存下来以后再用).",
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['reflection', 'project_breakdown', 'method', 'discovery', 'sharing', 'fragment'],
          description: 'What kind of insight this is',
        },
        title: { type: 'string', description: 'Short title (≤200 chars)' },
        body: {
          type: 'string',
          description:
            'Full content. For project_breakdown, use the cycle 起点 → 过程 → 发现 → 优化.',
        },
        tags: {
          type: 'array',
          description: 'Optional short tags, e.g. ["效率", "viralpost"]. Max 20.',
        },
      },
      required: ['kind', 'title', 'body'],
    },
  },
  {
    name: 'list_insights',
    description:
      "List the user's saved insights, newest first. Filter by `kind` or substring `q` (matches title + body). Use this to recall what the user has already captured before generating daily content — anchor tweets in their real thinking, not generic AI filler.",
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['reflection', 'project_breakdown', 'method', 'discovery', 'sharing', 'fragment'],
          description: 'Optional kind filter',
        },
        q: { type: 'string', description: 'Optional substring search (case-insensitive)' },
        limit: { type: 'string', description: 'Optional, default 30, max 100' },
      },
    },
  },
  {
    name: 'delete_insight',
    description:
      "Delete one of the user's insights by id. Use when the user says something is no longer relevant or was saved by mistake.",
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Insight id (uuid)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_insights',
    description:
      "Semantic-ish text search over the user's insights. Same as list_insights with a `q` parameter — exposed as a separate tool so the agent can reach for 'search my past thinking' as a distinct intent from 'list recent'.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'string', description: 'Optional, default 10' },
      },
      required: ['query'],
    },
  },
];

export async function runTool(
  name: ToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const userId = ctx.userId;
  switch (name) {
    case 'web_search':
      return tavilySearch(
        userId,
        String(args.query ?? ''),
        Number(args.max_results ?? 5),
      );
    case 'web_image_search':
      return tavilyImageSearch(
        userId,
        String(args.query ?? ''),
        Number(args.max_results ?? 6),
      );
    case 'github_read':
      return githubRead(
        userId,
        String(args.owner),
        String(args.repo),
        String(args.path ?? 'README.md'),
      );
    case 'twitter_search':
      return twitterApi(userId, 'search', {
        query: String(args.query ?? ''),
        count: String(args.count ?? 20),
      });
    case 'twitter_get_user_tweets':
      return twitterApi(userId, 'user-tweets', {
        username: String(args.username ?? ''),
        count: String(args.count ?? 10),
      });
    case 'twitter_get_tweet_replies':
      return twitterGetReplies(
        userId,
        String(args.tweet_id ?? ''),
        Number(args.count ?? 30),
      );
    case 'suggest_similar_creators':
      return suggestSimilarCreators(
        String(args.account_context ?? ''),
        (args.language as 'zh' | 'en') ?? 'zh',
      );
    case 'remember_preference':
      return rememberPreference(userId, String(args.key ?? ''), args.value);
    case 'read_preferences':
      return readPreferencesTool(userId, {
        keys: Array.isArray(args.keys)
          ? (args.keys as unknown[]).map(String)
          : undefined,
        scopes: Array.isArray(args.scopes)
          ? (args.scopes as unknown[]).map(String)
          : undefined,
      });
    case 'save_insight':
      return saveInsight(userId, ctx.conversationId, {
        kind: String(args.kind ?? ''),
        title: String(args.title ?? ''),
        body: String(args.body ?? ''),
        tags: Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : undefined,
      });
    case 'list_insights':
      return listInsights(userId, {
        kind: args.kind ? String(args.kind) : undefined,
        q: args.q ? String(args.q) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });
    case 'delete_insight':
      return deleteInsight(userId, String(args.id ?? ''));
    case 'search_insights':
      return searchInsights(
        userId,
        String(args.query ?? ''),
        args.limit ? Number(args.limit) : undefined,
      );
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
