/**
 * Tools available to the Social Advisor (creatra) agent.
 * Each tool is described in the format DeepSeek's function-calling expects.
 *
 * All API credentials are read from `vp_user_preferences` (Supabase KV) FIRST,
 * then fall back to `process.env.*`. This means the user can paste a new
 * GitHub token (or rotate X cookies) right in the chat, and the LLM picks
 * it up via the `remember_preference` tool without redeployment.
 */

import type { ToolDefinition } from'./llm';
import { deepseek } from'./llm';
import { getDb, TABLE } from'./db';

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
 if (typeof fromPref ==='string'&& fromPref.length > 0) return fromPref;
 const env = process.env[envKey];
 return env && env.length > 0 ? env : null;
}

// ─── Tool implementations ────────────────────────────────────────────────

async function tavilySearch(
 userId: string,
 query: string,
 maxResults = 5,
): Promise<ToolResult> {
 // Tavily key 是 site-wide 配置,从环境变量 TAVILY_API_KEY 读(用户在 Vercel 配)
 // (不是 per-user 配置,不要放 Sources 面板)
 const apiKey = process.env.TAVILY_API_KEY;
 if (!apiKey) {
 return {
 ok: false,
 error:'web_search is temporarily unavailable (TAVILY_API_KEY not set in env).',
 };
 }
 try {
 const r = await fetch('https://api.tavily.com/search', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 api_key: apiKey,
 query,
 max_results: maxResults,
 include_answer: true,
 search_depth:'basic',
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
 // 同 tavilySearch: site-wide,环境变量 TAVILY_API_KEY
 const apiKey = process.env.TAVILY_API_KEY;
 if (!apiKey) {
 return {
 ok: false,
 error:'web_image_search is temporarily unavailable (TAVILY_API_KEY not set in env).',
 };
 }
 try {
 const r = await fetch('https://api.tavily.com/search', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 api_key: apiKey,
 query,
 max_results: maxResults,
 include_images: true,
 search_depth:'basic',
 }),
 });
 if (!r.ok) {
 return { ok: false, error: `Tavily HTTP ${r.status}` };
 }
 const data = (await r.json()) as { images?: Array<{ url: string; description?: string }> };
 const images = (data.images ?? [])
 .filter((img) => typeof img.url ==='string'&& img.url.length > 0)
 .slice(0, maxResults)
 .map((img) => ({
 url: img.url,
 description: img.description ??'',
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
 path ='README.md',
): Promise<ToolResult> {
 const headers: Record<string, string> = {
 Accept:'application/vnd.github+json','User-Agent':'creatra-agent',
 };
 const token = await getCred(userId,'github.token','GITHUB_TOKEN');
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
 if (data.encoding ==='base64'&& data.content) {
 const decoded = Buffer.from(data.content,'base64').toString('utf-8');
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
 return { ok: false, error:'Unexpected response shape'};
 } catch (e) {
 return { ok: false, error: e instanceof Error ? e.message : String(e) };
 }
}

/**
 * Standard X GraphQL features payload. Required for almost all modern X GraphQL
 * endpoints — without it, X returns 404 even with valid cookies (X rotated the
 * feature flag expectations and the old query hash is now incompatible).
 *
 * Keep this in sync with what the x.com web client sends. Last verified: 2026-07-22,
 * captured from a real x.com SearchTimeline request.
 */
const X_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
} as const;

function xGraphqlUrl(
  queryHash: string,
  operation: string,
  variables: Record<string, unknown>,
  extraQuery?: Record<string, unknown>,
): string {
  const params: Record<string, string> = {
  variables: JSON.stringify(variables),
  features: JSON.stringify(X_FEATURES),
  fieldToggles: JSON.stringify({}),
  };
  if (extraQuery) {
  for (const [k, v] of Object.entries(extraQuery)) {
  params[k] = String(v);
  }
  }
  const qs = Object.entries(params)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join('&');
  return `https://x.com/i/api/graphql/${queryHash}/${operation}?${qs}`;
}

async function twitterApi(
  userId: string,
  endpoint:'search'|'user-tweets',
  params: Record<string, string>,
): Promise<ToolResult> {
  const authToken = await getCred(userId,'x.auth_token','X_AUTH_TOKEN');
  const ct0 = await getCred(userId,'x.ct0','X_CT0');
  if (!authToken || !ct0) {
  return {
  ok: false,
  error:'X cookies not configured. Tell the user to add X_AUTH_TOKEN + X_CT0 in Sources, or via remember_preference(key="x.auth_token"/"x.ct0", value=...).',
  };
  }

  const headers: Record<string, string> = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Authorization:'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  Cookie: `auth_token=${authToken}; ct0=${ct0}`,'X-Csrf-Token': ct0,'X-Twitter-Auth-Type':'OAuth2Session','Content-Type':'application/json',
  };

  try {
  let data: unknown;
  if (endpoint ==='user-tweets') {
  const username = params.username;
  if (!username) return { ok: false, error:'username required'};
  const userIdRes = await fetch(
  xGraphqlUrl('G3KGOASz96M-Qu0nwmGXNg','UserByScreenName', {
  screen_name: username,
  withSafetyModeUserFields: true,
  }),
  { headers, signal: AbortSignal.timeout(10000) },
  );
  const userIdJson = await safeParseJson(userIdRes, 'UserByScreenName');
  if (!userIdJson.ok) return userIdJson;
  const restId = (userIdJson.data as { data?: { user?: { result?: { rest_id?: string } } } })?.data?.user?.result?.rest_id;
  if (!restId) return { ok: false, error:'User not found'};

  const tweetsRes = await fetch(
  xGraphqlUrl('E3opETHurmVJflFsUBVuQ','UserTweets', {
  userId: restId,
  count: Number(params.count ?? 10),
  includePromotedContent: false,
  withQuickPromoteEligibilityTweetFields: true,
  withVoice: true,
  withV2Timeline: true,
  }),
  { headers, signal: AbortSignal.timeout(10000) },
  );
  data = (await safeParseJson(tweetsRes, 'UserTweets')).data;
  } else {
  const query = params.query;
  if (!query) return { ok: false, error:'query required'};
  const searchRes = await fetch(
  xGraphqlUrl('hz_94eVAtrtQo_vO3my7Rw','SearchTimeline', {
  rawQuery: query,
  count: Number(params.count ?? 20),
  querySource:'typed_query',
  product: params.product ??'Latest',
  withGrokTranslatedBio: false,
  withQuickPromoteEligibilityTweetFields: true,
  }),
  { headers, signal: AbortSignal.timeout(10000) },
  );
  const parsed = await safeParseJson(searchRes,'SearchTimeline');
  if (!parsed.ok) return parsed;
  data = parsed.data;
  }
  return { ok: true, data };
  } catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Robust response parser — distinguishes "X returned non-JSON" (HTML challenge,
 * empty body, network drop) from "X returned a real auth/permission error".
 * Without this, every X failure looks the same ("Unexpected token < in JSON"),
 * so the agent can't tell if cookies are bad, X is blocking the Vercel IP, or
 * the request just timed out.
 */
async function safeParseJson(
  res: Response,
  endpoint: string,
): Promise<ToolResult & { data?: unknown }> {
  const status = res.status;
  // 1. Read raw body first — we need it either way.
  const raw = await res.text().catch(() =>'<body unreadable>');
  const truncated = raw.slice(0, 300).replace(/\s+/g,' ').trim();

  if (!res.ok) {
  // 2a. HTTP error (401 / 403 / 429 / 5xx). Surface status + body excerpt.
  let hint ='';
  if (status === 401 || status === 403) {
  hint = ' (cookies likely expired/invalid — re-extract auth_token + ct0 from x.com)';
  } else if (status === 429) {
  hint = ' (X rate-limited this IP — likely the Vercel datacenter IP is being throttled)';
  } else if (status >= 500) {
  hint = ' (X server error)';
  }
  return {
  ok: false,
  error: `X ${endpoint} returned HTTP ${status}${hint}. Body: ${truncated}`,
  };
  }

  // 2b. Status 200 but body is not JSON. The most common cause on Vercel is
  //     X serving an HTML anti-bot challenge page to datacenter IPs.
  try {
  const data = JSON.parse(raw);
  return { ok: true, data };
  } catch {
  const looksLikeHtml = /^<(!doctype|html)/i.test(raw.trim());
  const hint = looksLikeHtml
  ? ' (X returned an HTML page — likely an anti-bot challenge; Vercel datacenter IP is being challenged, not a cookies problem)'
  : ' (X returned non-JSON content)';
  return {
  ok: false,
  error: `X ${endpoint} HTTP 200 but body is not JSON${hint}. Body: ${truncated}`,
  };
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
 const authToken = await getCred(userId,'x.auth_token','X_AUTH_TOKEN');
 const ct0 = await getCred(userId,'x.ct0','X_CT0');
 if (!authToken || !ct0) {
 return {
 ok: false,
 error:'X cookies not configured. Add X_AUTH_TOKEN + X_CT0 in Sources.',
 };
 }
 if (!tweetId || !/^\d{5,30}$/.test(tweetId)) {
 return { ok: false, error:'tweet_id must be a numeric X tweet id'};
 }

 const headers: Record<string, string> = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
 Authorization:'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
 Cookie: `auth_token=${authToken}; ct0=${ct0}`,'X-Csrf-Token': ct0,'X-Twitter-Auth-Type':'OAuth2Session','Content-Type':'application/json',
 };

 try {
 const r = await fetch(
 `https://api.twitter.com/graphql/hz_94eVAtrtQo_vO3my7Rw/SearchTimeline?variables=${encodeURIComponent(
 JSON.stringify({
 rawQuery: `conversation_id:${tweetId}`,
 count,
 querySource:'typed_query',
 product:'Latest',
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

/**
 * Pull metrics for a single tweet via the TweetDetail GraphQL endpoint.
 * Returns likes/retweets/replies/quotes/impressions/bookmarks.
 */
async function twitterGetTweetMetrics(
 userId: string,
 tweetId: string,
): Promise<ToolResult> {
 const authToken = await getCred(userId,'x.auth_token','X_AUTH_TOKEN');
 const ct0 = await getCred(userId,'x.ct0','X_CT0');
 if (!authToken || !ct0) {
 return { ok: false, error:'X cookies not configured. Add X_AUTH_TOKEN + X_CT0 in Sources.'};
 }
 if (!tweetId || !/^\d{5,30}$/.test(tweetId)) {
 return { ok: false, error:'tweet_id must be a numeric X tweet id'};
 }

 const headers: Record<string, string> = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
 Authorization:'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
 Cookie: `auth_token=${authToken}; ct0=${ct0}`,'X-Csrf-Token': ct0,'X-Twitter-Auth-Type':'OAuth2Session','Content-Type':'application/json',
 };

 const variables = {
 focalTweetId: tweetId,
 with_rux_injections: false,
 includePromotedContent: false,
 withCommunity: true,
 withQuickPromoteEligibilityTweetFields: true,
 withBirdwatchNotes: true,
 withVoice: true,
 withV2Timeline: true,
 };
 const features = {
 creator_subscriptions_tweet_preview_api_enabled: true,
 tweetypie_unmention_optimization_enabled: true,
 responsive_web_edit_api_enabled: true,
 graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
 view_counts_everywhere_api_enabled: true,
 longform_notetweets_consumption_enabled: true,
 responsive_web_twitter_article_tweet_consumption_enabled: false,
 tweet_awards_web_tipping_enabled: false,
 freedom_of_speech_not_reach_fetch_enabled: true,
 standardized_nudges_misinfo: true,
 longform_notetweets_rich_text_read_enabled: true,
 longform_notetweets_inline_media_enabled: true,
 responsive_web_enhance_cards_enabled: false,
 };

 try {
 const url = `https://api.twitter.com/graphql/xOhkmRac04YFZmOzU9PJHg/TweetDetail?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;
 const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
 if (!r.ok) return { ok: false, error: `X GraphQL HTTP ${r.status}` };
 const data = await r.json();

 // Extract metrics from the deep-nested response
 const metrics = extractMetricsFromTweetDetail(data, tweetId);
 if (!metrics) {
 return { ok: false, error:'Tweet not found or not accessible'};
 }
 return { ok: true, data: metrics };
 } catch (e) {
 return { ok: false, error: e instanceof Error ? e.message : String(e) };
 }
}

function extractMetricsFromTweetDetail(data: any, tweetId: string) {
 try {
 const instructions = data?.data?.tweetResult?.timeline_response?.timeline?.instructions ?? [];
 const entries: any[] = [];
 for (const instr of instructions) {
 if (instr.type ==='TimelineAddEntries'&& Array.isArray(instr.entries)) {
 entries.push(...instr.entries);
 }
 }
 for (const entry of entries) {
 const result =
 entry?.content?.itemContent?.tweet_results?.result ??
 entry?.content?.tweet_results?.result;
 if (!result) continue;
 const legacy = result.legacy ?? result.tweet?.legacy;
 if (!legacy || legacy.id_str !== tweetId) continue;
 return {
 likes: legacy.favorite_count ?? 0,
 retweets: legacy.retweet_count ?? 0,
 replies: legacy.reply_count ?? 0,
 quotes: legacy.quote_count ?? 0,
 bookmarks: legacy.bookmark_count ?? 0,
 impressions: result.views?.count ?? legacy.favorite_count ?? 0,
 pulled_at: new Date().toISOString(),
 };
 }
 } catch {}
 return null;
}

/**
 * Search for @handle mentions via SearchTimeline.
 * Filters out tweets authored by the user themselves.
 */
async function twitterGetMentions(
 userId: string,
 handle: string,
 hours: number = 24,
 maxResults: number = 20,
): Promise<ToolResult> {
 const clean = handle.replace(/^@/,'').trim();
 if (!clean) return { ok: false, error:'handle required'};

 const authToken = await getCred(userId,'x.auth_token','X_AUTH_TOKEN');
 const ct0 = await getCred(userId,'x.ct0','X_CT0');
 if (!authToken || !ct0) {
 return { ok: false, error:'X cookies not configured. Add X_AUTH_TOKEN + X_CT0 in Sources.'};
 }

 const headers: Record<string, string> = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
 Authorization:'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
 Cookie: `auth_token=${authToken}; ct0=${ct0}`,'X-Csrf-Token': ct0,'X-Twitter-Auth-Type':'OAuth2Session','Content-Type':'application/json',
 };

 try {
 const r = await fetch(
 `https://api.twitter.com/graphql/hz_94eVAtrtQo_vO3my7Rw/SearchTimeline?variables=${encodeURIComponent(
 JSON.stringify({
 rawQuery: `@${clean} -from:${clean}`,
 count: maxResults,
 querySource:'typed_query',
 product:'Latest',
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
 language:'zh'|'en'='zh',
): Promise<ToolResult> {
 if (!process.env.DEEPSEEK_API_KEY) {
 return { ok: false, error:'DEEPSEEK_API_KEY not set'};
 }
 const prompt =
 language ==='zh'? `基于以下账号定位,推荐 15-20 个可能的相似/对标 X(Twitter)账号。

账号定位:${accountContext}

要求:
- 优先推荐真人创作者,不要官方品牌账号
- 推荐不同量级的账号(几个大 V + 几个成长中的 + 几个小而新)
- 给出每个账号的 @handle、一句话简介、为什么值得对标、估算粉丝数级别
- **诚实**:有些 handle 你可能记不清或不确定,可以列出来但**不要瞎编**。给每条加"confidence":"high|medium|low"标记
 - high: 非常确定这个人在做这个方向
 - medium: 大概在做这个方向,可能有偏差
 - low: 名字可能记错或人可能已经改名/不活跃
- 直接输出 JSON 数组,不要 markdown

格式:
[{"handle":"@xxx","bio":"一句话简介","why":"为什么对标","followerRange":"1k-10k|10k-100k|100k+","confidence":"high|medium|low"}]`
 : `Recommend 15-20 candidate similar/benchmark X (Twitter) accounts based on the following account positioning.

Positioning: ${accountContext}

Requirements:
- Prioritize real creators, not official brand accounts
- Mix follower sizes (a few big + several growing + a few small/new)
- For each: @handle, one-line bio, why they're a good benchmark, follower range
- **Be honest**: if you're not sure about a handle or the person may have rebranded/gone inactive, include it but tag confidence as"low". Do NOT fabricate handles.
- Mark each with"confidence":"high|medium|low"- Output raw JSON array, no markdown

Format:
[{"handle":"@xxx","bio":"one-line bio","why":"why benchmark","followerRange":"1k-10k|10k-100k|100k+","confidence":"high|medium|low"}]`;

 try {
 const r = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 {
 role:'system',
 content:'You are a research assistant that recommends X (Twitter) accounts. Output strictly valid JSON only — no markdown fences, no explanations. Return a JSON object with a"creators"array of 15-20 entries.',
 },
 { role:'user', content: prompt },
 ],
 response_format: { type:'json_object'},
 temperature: 0.7,
 max_tokens: 3000,
 });
 const content = (r as any).choices?.[0]?.message?.content;
 if (!content) return { ok: false, error:'Empty LLM response'};
 try {
 const parsed = JSON.parse(content);
 const list = Array.isArray(parsed)
 ? parsed
 : (parsed.creators ?? parsed.suggestions ?? parsed.accounts ?? []);
 return { ok: true, data: list };
 } catch {
 return { ok: false, error:'Invalid JSON from LLM'};
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
 typeof value ==='string'? value.trim() : value;

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
 error:'Failed to save (DB unavailable or invalid value).',
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
 ?'[REDACTED]': null,
 hint: isConflict
 ?'This key had a different value. The new value replaced it. If the user wanted both, ask whether to keep the old one or treat it as superseded.': null,
 },
 };
}

async function readPreferencesTool(
 userId: string,
 options: { keys?: string[]; scopes?: string[] } = {},
): Promise<ToolResult> {
 const db = getDb();
 if (!db) return { ok: false, error:'DB not available'};
 try {
 const { keys, scopes } = options;
 // Three modes:
 // keys=[...] only → specific keys
 // scopes=[...] only → by memory scope
 // both → intersection
 // neither → all (default)
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
  ?'[REDACTED: set]':'[not set]': row.value,
  last_used_at: row.last_used_at ? String(row.last_used_at) : null,
  last_confirmed_at: String(row.last_confirmed_at),
  };
  });
 }

  /**
 * Self-test the user's X cookies against the TWO endpoints the agent actually
 * uses (UserByScreenName for cookies sanity, SearchTimeline for actual search).
 *
 * Why two probes: UserByScreenName accepts the cookies and returns 200, but
 * SearchTimeline can independently 404 because X rotated that specific query
 * hash. Probing only one endpoint gives a misleading "all good" answer and
 * causes the agent to loop retrying search.
 *
 * Returns a structured diagnosis the agent (or user) can read directly:
 * - "ok" → cookies + both endpoints working
 * - "cookies missing" → not configured in Sources
 * - "cookies expired" → X returned 401/403, user must re-extract
 * - "search hash dead" → cookies work, but SearchTimeline returned 404 (X
 *   rotated the GraphQL hash). The X search feature is broken until someone
 *   updates the query hash in src/lib/tools.ts (search for "hz_94eVAtrtQo_vO3my7Rw").
 * - "rate limited" → X throttled the Vercel IP
 * - "anti-bot challenge" → X returned HTML instead of JSON
 * - "network/timeout" → fetch didn't get a response
 */
async function verifyXCredentials(userId: string): Promise<ToolResult> {
  const authToken = await getCred(userId,'x.auth_token','X_AUTH_TOKEN');
  const ct0 = await getCred(userId,'x.ct0','X_CT0');
  if (!authToken || !ct0) {
  return {
  ok: false,
  error:'X cookies not configured in Sources. User needs to add x.auth_token + x.ct0.',
  };
  }

  const headers: Record<string, string> = {
  'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Authorization:'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  Cookie: `auth_token=${authToken}; ct0=${ct0}`,
  'X-Csrf-Token': ct0,
  'X-Twitter-Auth-Type':'OAuth2Session',
  'Content-Type':'application/json',
  };

  // Probe 1: UserByScreenName @twitter — the cheap cookie sanity check.
  const probe1 = await probeXEndpoint(headers,'UserByScreenName',
  'G3KGOASz96M-Qu0nwmGXNg',
  { screen_name:'twitter', withSafetyModeUserFields: true },
  );

  if (probe1.kind ==='network') {
  return { ok: false, error: probe1.summary };
  }
  if (probe1.kind ==='auth_expired') {
  return {
  ok: false,
  error: `X returned ${probe1.status} to UserByScreenName → cookies are expired/invalid. Re-extract auth_token + ct0 from x.com. ${probe1.summary}`,
  };
  }
  if (probe1.kind ==='rate_limited') {
  return { ok: false, error: `X rate-limited the Vercel IP. ${probe1.summary}` };
  }
  if (probe1.kind ==='antipbot') {
  return {
  ok: false,
  error: `X returned an HTML anti-bot challenge on UserByScreenName. Vercel datacenter IP is being challenged. X integration will not work from this deployment. ${probe1.summary}`,
  };
  }
  if (probe1.kind ==='other_4xx_5xx') {
  return { ok: false, error: `X returned HTTP ${probe1.status} to UserByScreenName. ${probe1.summary}` };
  }
  // probe1.kind === 'ok' from here on.

  // Probe 2: SearchTimeline — the actual endpoint that 404s. We probe this
  // even if probe1 was ok, because X can rotate hashes independently.
  const probe2 = await probeXEndpoint(headers,'SearchTimeline',
  'hz_94eVAtrtQo_vO3my7Rw',
  {
  rawQuery:'hello',
  count: 5,
  querySource:'typed_query',
  product:'Latest',
  withGrokTranslatedBio: false,
  withQuickPromoteEligibilityTweetFields: true,
  },
  );

  if (probe2.kind ==='network') {
  return { ok: false, error: `UserByScreenName works, but SearchTimeline hit a network error. ${probe2.summary}` };
  }
  if (probe2.kind ==='auth_expired') {
  // This shouldn't happen if probe1 was ok, but handle it anyway.
  return { ok: false, error: `SearchTimeline ${probe2.status} (cookies seem to work for some endpoints but not this one). ${probe2.summary}` };
  }
  if (probe2.kind ==='rate_limited') {
  return { ok: false, error: `UserByScreenName works, but SearchTimeline is rate-limited. ${probe2.summary}` };
  }
  if (probe2.kind ==='antipbot') {
  return { ok: false, error: `SearchTimeline hit anti-bot challenge. ${probe2.summary}` };
  }
  if (probe2.kind ==='other_4xx_5xx') {
  // 404 is the common case here. Surface a clear, actionable diagnosis.
  if (probe2.status === 404) {
  return {
  ok: false,
  error: `X search is BROKEN: SearchTimeline returns HTTP 404. ` +
  `Cookies work fine (UserByScreenName OK), but the GraphQL query hash ` +
  `'hz_94eVAtrtQo_vO3my7Rw' has been rotated by X. The '今日 X 热点' chip ` +
  `and any twitter_search / twitter_get_user_tweets call will fail until ` +
  `someone updates the hash in src/lib/tools.ts (capture the new one from ` +
  `x.com DevTools → Network → any GraphQL request → copy the hash from the URL).`,
  };
  }
  return { ok: false, error: `SearchTimeline HTTP ${probe2.status}. ${probe2.summary}` };
  }
  // Both probes ok.
  return {
  ok: true,
  data: {
  diagnosis:'ok',
  message: 'X cookies are working. UserByScreenName and SearchTimeline both return 200. Search and user-tweet tools are available.',
  },
  };
 }

 /**
 * Internal probe helper used by verifyXCredentials. Returns a tagged-union
 * result so the caller can branch on what kind of failure it was.
 */
type XProbeResult =
  | { kind:'ok'; status: 200; raw: string }
  | { kind:'network'; summary: string }
  | { kind:'auth_expired'; status: 401 | 403; summary: string }
  | { kind:'rate_limited'; status: 429; summary: string }
  | { kind:'antipbot'; status: 200; summary: string }
  | { kind:'other_4xx_5xx'; status: number; summary: string };

 async function probeXEndpoint(
  headers: Record<string, string>,
  operation: string,
  queryHash: string,
  variables: Record<string, unknown>,
 ): Promise<XProbeResult> {
  let res: Response;
  try {
  res = await fetch(
  xGraphqlUrl(queryHash, operation, variables),
  { headers, signal: AbortSignal.timeout(10000) },
  );
  } catch (e) {
  return {
  kind:'network',
  summary: `Network error on ${operation}: ${e instanceof Error ? e.message : String(e)} (Vercel → api.twitter.com may be blocked from this region).`,
  };
  }

  const status = res.status;
  const raw = await res.text().catch(() =>'<unreadable>');
  const truncated = raw.slice(0, 250).replace(/\s+/g,' ').trim();

  if (status === 200) {
  try {
  JSON.parse(raw);
  return { kind:'ok', status: 200, raw };
  } catch {
  const html = /^<(!doctype|html)/i.test(raw.trim());
  if (html) {
  return {
  kind:'antipbot',
  status: 200,
  summary: `${operation} returned 200 with HTML anti-bot page. body: ${truncated}`,
  };
  }
  return {
  kind:'other_4xx_5xx',
  status: 200,
  summary: `${operation} returned 200 with non-JSON body. body: ${truncated}`,
  };
  }
  }

  if (status === 401 || status === 403) {
  return {
  kind:'auth_expired',
  status: status as 401 | 403,
  summary: `${operation} HTTP ${status}. body: ${truncated}`,
  };
  }
  if (status === 429) {
  return {
  kind:'rate_limited',
  status: 429,
  summary: `${operation} HTTP 429. body: ${truncated}`,
  };
  }
  return {
  kind:'other_4xx_5xx',
  status,
  summary: `${operation} HTTP ${status}. body: ${truncated}`,
  };
 }

 // ─── Insights (user-accumulated content) ──────────────────────────────────
//
// The agent captures"沉淀"— reflections, project breakdowns, methods,
// discoveries, sharings, fragments — into vp_insights. Daily-content skill
// (skill 5) reads from this table to anchor tweets in real user thinking.

const INSIGHT_KINDS = new Set(['reflection','project_breakdown','method','discovery','sharing','fragment',
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
 const kind = String(args.kind ??'').trim();
 const title = String(args.title ??'').trim();
 const body = String(args.body ??'').trim();
 if (!INSIGHT_KINDS.has(kind)) {
 return { ok: false, error: `kind must be one of: ${[...INSIGHT_KINDS].join(',')}` };
 }
 if (!title) return { ok: false, error:'title required'};
 if (!body) return { ok: false, error:'body required'};
 if (title.length > 200) return { ok: false, error:'title too long (≤200 chars)'};
 if (body.length > 20_000) return { ok: false, error:'body too long (≤20k chars)'};

 const tags = Array.isArray(args.tags)
 ? args.tags.filter((t): t is string => typeof t ==='string').slice(0, 20).map((t) => t.slice(0, 60))
 : [];

 const db = getDb();
 if (!db) return { ok: false, error:'DB not available'};
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
 if (!db) return { ok: false, error:'DB not available'};
 const kind = args.kind?.trim() || null;
 const q = args.q?.trim() || null;
 const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
 if (kind && !INSIGHT_KINDS.has(kind)) {
 return { ok: false, error: `kind must be one of: ${[...INSIGHT_KINDS].join(',')}` };
 }
 try {
 const params: unknown[] = [userId];
 let where ='user_id = $1';
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
 return { ok: false, error:'id must be a uuid'};
 }
 const db = getDb();
 if (!db) return { ok: false, error:'DB not available'};
 try {
 const r = await db.query(
 `DELETE FROM ${TABLE.insights} WHERE id = $1::uuid AND user_id = $2`,
 [id, userId],
 );
 if (r.rowCount === 0) return { ok: false, error:'not found'};
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
 return { ok: false, error:'query required'};
 }
 // search_insights is currently just list_insights with a text match —
 // exposed as its own tool because the agent should reach for"search my
 // past thinking"semantically distinct from"list recent".
 return listInsights(userId, { q: query.trim(), limit });
}

// ─── User creators watch (vp_user_creators) ───────────────────────────────

/**
 * Persist an X creator the user wants to track. Idempotent: if the handle
 * already exists for this user, update display_name / reason / weight.
 */
async function rememberCreator(
 userId: string,
 args: {
 handle: string;
 display_name?: string;
 reason?: string;
 source?: string;
 weight?: number;
 },
): Promise<ToolResult> {
 const rawHandle = String(args.handle ??'').trim().replace(/^@+/, '');
 if (!rawHandle) return { ok: false, error:'handle required'};
 if (!/^[A-Za-z0-9_]{1,50}$/.test(rawHandle)) {
 return { ok: false, error:'handle 格式不合法(只允许字母数字下划线,1-50 字符)'};
 }
 const source = String(args.source ??'user');
 if (!['user','agent_suggested','auto_detected'].includes(source)) {
 return { ok: false, error:`source must be one of: user, agent_suggested, auto_detected`};
 }
 const displayName = args.display_name ? String(args.display_name).trim() : null;
 const reason = args.reason ? String(args.reason).trim() : null;
 const weight = Math.max(1, Math.min(10, Number(args.weight ?? 1)));

 const db = getDb();
 if (!db) return { ok: false, error:'DB not available'};
 try {
 const r = await db.query<{ id: number; created_at: string; handle: string }>(
 `INSERT INTO ${TABLE.userCreators} (user_id, handle, display_name, reason, source, weight)
 VALUES ($1, $2, $3, $4, $5, $6)
 ON CONFLICT (user_id, handle) DO UPDATE
 SET display_name = COALESCE(EXCLUDED.display_name, ${TABLE.userCreators}.display_name),
 reason = COALESCE(EXCLUDED.reason, ${TABLE.userCreators}.reason),
 source = EXCLUDED.source,
 weight = EXCLUDED.weight,
 updated_at = now()
 RETURNING id, created_at, handle`,
 [userId, rawHandle, displayName, reason, source, weight],
 );
 return {
 ok: true,
 data: {
 handle: r.rows[0].handle,
 id: r.rows[0].id,
 created_at: r.rows[0].created_at,
 action: r.rows[0]?.id ?'saved_or_updated': null,
 },
 };
 } catch (e) {
 return { ok: false, error: e instanceof Error ? e.message : String(e) };
 }
}

/**
 * List creators the user is watching. Sorted by weight desc, then most recent.
 */
async function listCreators(
 userId: string,
 options: { limit?: number; source?: string } = {},
): Promise<ToolResult> {
 const limit = Math.max(1, Math.min(100, Number(options.limit ?? 50)));
 const db = getDb();
 if (!db) return { ok: false, error:'DB not available'};
 try {
 const r = await db.query<{
 id: number;
 handle: string;
 display_name: string | null;
 reason: string | null;
 source: string;
 weight: number;
 created_at: string;
 }>(
 `SELECT id, handle, display_name, reason, source, weight, created_at
 FROM ${TABLE.userCreators}
 WHERE user_id = $1
 ORDER BY weight DESC, created_at DESC
 LIMIT $2`,
 [userId, limit],
 );
 return { ok: true, data: { creators: r.rows, count: r.rows.length } };
 } catch (e) {
 return { ok: false, error: e instanceof Error ? e.message : String(e) };
 }
}

/**
 * Remove a creator from the watch list.
 */
async function forgetCreator(
 userId: string,
 handle: string,
): Promise<ToolResult> {
 const rawHandle = String(handle ??'').trim().replace(/^@+/, '');
 if (!rawHandle) return { ok: false, error:'handle required'};
 const db = getDb();
 if (!db) return { ok: false, error:'DB not available'};
 try {
 const r = await db.query<{ rowCount: number }>(
 `DELETE FROM ${TABLE.userCreators} WHERE user_id = $1 AND handle = $2`,
 [userId, rawHandle],
 );
 if (r.rowCount === 0) {
 return { ok: false, error:`未找到 @${rawHandle} 在你的关注列表中`};
 }
 return { ok: true, data: { handle: rawHandle, removed: true } };
 } catch (e) {
 return { ok: false, error: e instanceof Error ? e.message : String(e) };
 }
}

// ─── Tool registry (definitions + dispatch) ───────────────────────────────

export type ToolName =
  |'web_search'|'web_image_search'|'github_read'|'twitter_search'|'twitter_get_user_tweets'|'twitter_get_tweet_replies'|'twitter_get_tweet_metrics'|'twitter_get_mentions'|'verify_x_credentials'|'suggest_similar_creators'|'remember_preference'|'read_preferences'|'save_insight'|'list_insights'|'delete_insight'|'search_insights'|'remember_creator'|'list_creators'|'forget_creator';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
 {
 name:'web_search',
 description:"Search the web for recent news, trends, and articles. Use when you need to know what is happening in the user's niche right now.",
 parameters: {
 type:'object',
 properties: {
 query: { type:'string', description:'Search query'},
 max_results: { type:'string', description:'Optional, default 5'},
 },
 required: ['query'],
 },
 },
 {
 name:'web_image_search',
 description:"Image-only web search. Returns image URLs (and a short description) for a query — use this when planning a tweet that needs a hero image and the image is something that can be sourced from the open web (stock photo, screenshot, infographic, etc.). If the planned image must be user-created (custom diagram, personal photo, AI-generated), don't call this — instead, in your tweet plan, write a clear'🖼️ 你需要提供:[description]'line so the user knows what to prepare.",
 parameters: {
 type:'object',
 properties: {
 query: { type:'string', description:'What the image should be about'},
 max_results: { type:'string', description:'Optional, default 6'},
 },
 required: ['query'],
 },
 },
 {
 name:'github_read',
 description:"Read a file from a public GitHub repository. Use to learn what the user is building so their content can naturally reference it (build-in-public strategy). Auth token (if any) is read from preferences'github.token'.",
 parameters: {
 type:'object',
 properties: {
 owner: { type:'string', description:'GitHub user or org'},
 repo: { type:'string', description:'Repository name'},
 path: { type:'string', description:'File path, default README.md'},
 },
 required: ['owner','repo'],
 },
 },
  {
  name:'twitter_search',
  description:"Search recent tweets on X by keyword. Use to find trending discussions and angle ideas. Requires X cookies (preferences'x.auth_token'+'x.ct0').",
  parameters: {
  type:'object',
  properties: {
  query: { type:'string', description:'Search query'},
  count: { type:'string', description:'Optional, default 20'},
  },
  required: ['query'],
  },
  },
  {
  name:'verify_x_credentials',
  description:"Self-test the user's X cookies (auth_token + ct0) and report exactly what's wrong. Call this BEFORE twitter_search when an X call just failed with a vague error — it returns a precise diagnosis: 'ok' / 'cookies expired (401/403)' / 'X anti-bot challenge (HTML returned)' / 'rate-limited (429)' / 'network error'. Helps distinguish cookie problems from Vercel-IP problems.",
  parameters: {
  type:'object',
  properties: {},
  required: [],
  },
  },
 {
  name:'twitter_get_user_tweets',
  description:"Fetch the most recent tweets of a given X user. Use to study a benchmark account's recent content. For the user's OWN tweets, read their handle from Sources panel ('自己的 X 账号' / x.handle key) and call this with that handle — the response includes impressions/likes/reposts/replies metrics on each tweet which skill 8 (analysis) needs. Requires X cookies in preferences.",
 parameters: {
 type:'object',
 properties: {
 username: { type:'string', description:'X handle without @'},
 count: { type:'string', description:'Optional, default 10'},
 },
 required: ['username'],
 },
 },
 {
 name:'twitter_get_tweet_replies',
 description:"Fetch the conversation thread under a single tweet (parent + replies) by tweet id. Use this for skill 6 (comment triage) — the user has their own recent tweet ids from twitter_get_user_tweets(their_handle), pass each interesting one here, then decide which replies deserve a response and draft one. Requires X cookies.",
 parameters: {
 type:'object',
 properties: {
 tweet_id: { type:'string', description:'Numeric X tweet id'},
 count: { type:'string', description:'Optional, default 30'},
 },
 required: ['tweet_id'],
 },
 },
 {
 name:'twitter_get_tweet_metrics',
 description:"Fetch current engagement metrics (likes, retweets, replies, quotes, impressions, bookmarks) for a single tweet by id. Use after the user marks a tweet as'used'and pastes the URL — pull periodically to track which agent suggestions actually performed well. Requires X cookies.",
 parameters: {
 type:'object',
 properties: {
 tweet_id: { type:'string', description:'Numeric X tweet id (extracted from URL)'},
 },
 required: ['tweet_id'],
 },
 },
 {
 name:'twitter_get_mentions',
 description:"Search for recent tweets that @-mention a given X handle (excluding the user's own tweets). Use for engagement monitoring — when someone @s the user, surface it in the reply inbox. Requires X cookies.",
 parameters: {
 type:'object',
 properties: {
 handle: { type:'string', description:"User's X handle without @"},
 hours: { type:'string', description:'Lookback window in hours, default 24'},
 max_results: { type:'string', description:'Max tweets to return, default 20'},
 },
 required: ['handle'],
 },
 },
 {
 name:'suggest_similar_creators',
 description:"Given the user's account positioning, recommend 15-20 candidate similar / benchmark X creators as raw leads. Each comes with a confidence level (high/medium/low) reflecting how sure the LLM is. The LLM may fabricate or misremember handles, so the agent SHOULD verify each candidate afterwards via `web_search(\"@handle niche twitter\")` (cheap, works without X cookies) and `twitter_get_user_tweets(handle, count=3)` (real bio + recent activity, requires X cookies) before showing the final list. Filter out low-confidence or unverified candidates, then output the top 10 verified ones with real bio / follower count / latest tweet.",
 parameters: {
 type:'object',
 properties: {
 account_context: {
 type:'string',
 description:"The user's account positioning / niche",
 },
 language: { type:'string', description:'"zh"or"en", default"zh"'},
 },
 required: ['account_context'],
 },
 },
  {
  name:'remember_preference',
  description:"Persist a key/value pair the user wants the agent to remember across sessions. Use when the user shares a personal fact, position, or credential. For secrets (tokens, API keys), use keys ending in'.token','.key', or'.secret'— values will be redacted in logs and in subsequent read_preferences calls.",
  parameters: {
  type:'object',
  properties: {
  key: {
  type:'string',
  description:"Lowercase dot-separated key, e.g.'github.token','x.auth_token','account.niche'",
  },
  value: {
  type:'string',
  description:'Value to store (string for most cases)',
  },
  },
  required: ['key','value'],
  },
  },
  {
  name:'remember_creator',
  description:"Add an X creator to the user's watch list. Use this when the user mentions they like, follow, benchmark, or frequently reference a specific X handle. Idempotent — calling again with the same handle updates display_name/reason/weight. The watch list is what the '看对标动态' chip uses to fetch their latest tweets.",
  parameters: {
  type:'object',
  properties: {
  handle: { type:'string', description:"X handle without @, e.g.'naval'"},
  display_name: { type:'string', description:'Optional real name, e.g. "Naval Ravikant"'},
  reason: { type:'string', description:"Why the user tracks this creator, e.g.'我的对标,深度思考型'"},
  source: { type:'string', description:"'user'(explicitly told by user) / 'agent_suggested'(from suggest_similar_creators and user accepted) / 'auto_detected'(from conversation). Default 'user'."},
  weight: { type:'string', description:'Priority 1-10, default 1. Higher = more important.'},
  },
  required: ['handle'],
  },
  },
  {
  name:'list_creators',
  description:"List the X creators the user is watching, sorted by weight desc. Use to see what the '看对标动态' chip will fetch from. Returns handle, display_name, reason, source, weight.",
  parameters: {
  type:'object',
  properties: {
  limit: { type:'string', description:'Max results, default 50'},
  source: { type:'string', description:'Optional filter by source'},
  },
  },
  },
  {
  name:'forget_creator',
  description:"Remove an X creator from the user's watch list. Use when the user says '不要看 @xxx 了' or '把 @xxx 从关注列表里删了'.",
  parameters: {
  type:'object',
  properties: {
  handle: { type:'string', description:"X handle without @, e.g.'naval'"},
  },
  required: ['handle'],
  },
  },
  {
 name:'read_preferences',
 description:"Read stored preferences. You SHOULD pass `scopes` (one of:'account','voice','projects','insights','tools','episodic') so the system only returns the memories relevant to what you're doing — not the whole KV store. You may also pass `keys` for a specific list. Each scope has a clear purpose:'account'= who/what the account is,'voice'= how to write,'projects'= what user is building,'insights'= user's accumulated thinking (use list_insights for that),'tools'= credentials and tokens,'episodic'= past events. Calling this also updates the last_used_at timestamp on the returned rows — that's how memories stay'fresh'vs.'cold'.",
 parameters: {
 type:'object',
 properties: {
 scopes: {
 type:'array',
 description:'Optional list of scopes to read. Examples: ["account","voice"] for a tweet; ["projects"] for build-in-public context.',
 },
 keys: {
 type:'array',
 description:'Optional list of specific keys to read. Use only when you know exactly which key you need.',
 },
 },
 },
 },
 {
 name:'save_insight',
 description:"Save a piece of the user's accumulated thinking (a reflection, project breakdown, method, discovery, sharing, or raw fragment) to their long-term content library. The daily-content skill draws from this library to anchor tweets in real user thinking — not generic AI filler. Kinds:'reflection'(感悟),'project_breakdown'(项目复盘: 起点/过程/发现/优化),'method'(方法论),'discovery'(新发现),'sharing'(优质内容分享),'fragment'(碎片想法,先存下来以后再用).",
 parameters: {
 type:'object',
 properties: {
 kind: {
 type:'string',
 enum: ['reflection','project_breakdown','method','discovery','sharing','fragment'],
 description:'What kind of insight this is',
 },
 title: { type:'string', description:'Short title (≤200 chars)'},
 body: {
 type:'string',
 description:'Full content. For project_breakdown, use the cycle 起点 → 过程 → 发现 → 优化.',
 },
 tags: {
 type:'array',
 description:'Optional short tags, e.g. ["效率","creatra"]. Max 20.',
 },
 },
 required: ['kind','title','body'],
 },
 },
 {
 name:'list_insights',
 description:"List the user's saved insights, newest first. Filter by `kind` or substring `q` (matches title + body). Use this to recall what the user has already captured before generating daily content — anchor tweets in their real thinking, not generic AI filler.",
 parameters: {
 type:'object',
 properties: {
 kind: {
 type:'string',
 enum: ['reflection','project_breakdown','method','discovery','sharing','fragment'],
 description:'Optional kind filter',
 },
 q: { type:'string', description:'Optional substring search (case-insensitive)'},
 limit: { type:'string', description:'Optional, default 30, max 100'},
 },
 },
 },
 {
 name:'delete_insight',
 description:"Delete one of the user's insights by id. Use when the user says something is no longer relevant or was saved by mistake.",
 parameters: {
 type:'object',
 properties: {
 id: { type:'string', description:'Insight id (uuid)'},
 },
 required: ['id'],
 },
 },
 {
 name:'search_insights',
 description:"Semantic-ish text search over the user's insights. Same as list_insights with a `q` parameter — exposed as a separate tool so the agent can reach for'search my past thinking'as a distinct intent from'list recent'.",
 parameters: {
 type:'object',
 properties: {
 query: { type:'string', description:'Search query'},
 limit: { type:'string', description:'Optional, default 10'},
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
 case'web_search':
 return tavilySearch(
 userId,
 String(args.query ??''),
 Number(args.max_results ?? 5),
 );
 case'web_image_search':
 return tavilyImageSearch(
 userId,
 String(args.query ??''),
 Number(args.max_results ?? 6),
 );
 case'github_read':
 return githubRead(
 userId,
 String(args.owner),
 String(args.repo),
 String(args.path ??'README.md'),
 );
 case'twitter_search':
 return twitterApi(userId,'search', {
 query: String(args.query ??''),
 count: String(args.count ?? 20),
 });
 case'twitter_get_user_tweets':
 return twitterApi(userId,'user-tweets', {
 username: String(args.username ??''),
 count: String(args.count ?? 10),
 });
 case'twitter_get_tweet_replies':
 return twitterGetReplies(
 userId,
 String(args.tweet_id ??''),
 Number(args.count ?? 30),
 );
 case'twitter_get_tweet_metrics':
 return twitterGetTweetMetrics(
 userId,
 String(args.tweet_id ??''),
 );
  case'twitter_get_mentions':
  return twitterGetMentions(
  userId,
  String(args.handle ??''),
  Number(args.hours ?? 24),
  Number(args.max_results ?? 20),
  );
  case'verify_x_credentials':
  return verifyXCredentials(userId);
 case'suggest_similar_creators':
 return suggestSimilarCreators(
 String(args.account_context ??''),
 (args.language as'zh'|'en') ??'zh',
 );
  case'remember_preference':
  return rememberPreference(userId, String(args.key ??''), args.value);
  case'remember_creator':
  return rememberCreator(userId, {
  handle: String(args.handle ??''),
  display_name: args.display_name as string | undefined,
  reason: args.reason as string | undefined,
  source: args.source as string | undefined,
  weight: args.weight !== undefined ? Number(args.weight) : undefined,
  });
  case'list_creators':
  return listCreators(userId, {
  limit: args.limit !== undefined ? Number(args.limit) : undefined,
  source: args.source as string | undefined,
  });
  case'forget_creator':
  return forgetCreator(userId, String(args.handle ??''));
 case'read_preferences':
 return readPreferencesTool(userId, {
 keys: Array.isArray(args.keys)
 ? (args.keys as unknown[]).map(String)
 : undefined,
 scopes: Array.isArray(args.scopes)
 ? (args.scopes as unknown[]).map(String)
 : undefined,
 });
 case'save_insight':
 return saveInsight(userId, ctx.conversationId, {
 kind: String(args.kind ??''),
 title: String(args.title ??''),
 body: String(args.body ??''),
 tags: Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : undefined,
 });
 case'list_insights':
 return listInsights(userId, {
 kind: args.kind ? String(args.kind) : undefined,
 q: args.q ? String(args.q) : undefined,
 limit: args.limit ? Number(args.limit) : undefined,
 });
 case'delete_insight':
 return deleteInsight(userId, String(args.id ??''));
 case'search_insights':
 return searchInsights(
 userId,
 String(args.query ??''),
 args.limit ? Number(args.limit) : undefined,
 );
 default:
 return { ok: false, error: `Unknown tool: ${name}` };
 }
}
