#!/usr/bin/env node
/**
 * Diagnose X cookie issues against the production Supabase.
 *
 * Usage:
 *   DATABASE_URL=<pooler URL> node scripts/diagnose-x-cookies.mjs [user_email]
 *
 * What it does:
 *   1. Reads every user's x.auth_token / x.ct0 from vp_user_preferences
 *   2. For each, calls the same X API endpoint the agent uses (UserByScreenName)
 *   3. Reports the exact HTTP status + body excerpt, so we can tell:
 *      - 200 + JSON    → cookies are fine, the agent should be able to use them
 *      - 401/403       → cookies expired, user must re-extract from x.com
 *      - 429           → X rate-limited the Vercel IP
 *      - 200 + HTML    → X anti-bot challenge page; Vercel IP is blocked
 *      - timeout/err   → network can't reach api.twitter.com from this region
 *
 * No arguments = test all users with X cookies set.
 * One argument = only test the user whose email contains that string.
 */
import { Client } from 'pg';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is required.');
  console.error('Get the pooler URL from Vercel: Settings → Environment Variables → DATABASE_URL');
  process.exit(1);
}

const filter = process.argv[2]?.toLowerCase();
const db = new Client({ connectionString: dbUrl });
await db.connect();

const res = await db.query(`
  SELECT u.id, u.email, p.key, p.value
  FROM vp_users u
  JOIN vp_user_preferences p ON p.user_id = u.id
  WHERE p.key IN ('x.auth_token', 'x.ct0')
  ORDER BY u.email, p.key
`);

if (res.rows.length === 0) {
  console.log('No users have X cookies set. Save them via Sources panel first.');
  await db.end();
  process.exit(0);
}

const users = new Map();
for (const row of res.rows) {
  if (!users.has(row.id)) {
  users.set(row.id, { email: row.email, auth_token: null, ct0: null });
  }
  const u = users.get(row.id);
  // value is JSONB; pg returns it parsed. The secret is stored as a string.
  const v = typeof row.value === 'string' ? row.value : (row.value?.value ?? JSON.stringify(row.value));
  if (row.key === 'x.auth_token') u.auth_token = v;
  if (row.key === 'x.ct0') u.ct0 = v;
}

console.log(`Found ${users.size} user(s) with X cookies configured.\n`);

let tested = 0;
let skipped = 0;
for (const [uid, u] of users) {
  if (filter && !u.email.toLowerCase().includes(filter) && !uid.includes(filter)) {
  skipped++;
  continue;
  }

  console.log('━'.repeat(70));
  console.log(`User: ${u.email}  (id: ${uid})`);
  console.log(`  auth_token: ${u.auth_token ? u.auth_token.slice(0, 8) + '…(' + u.auth_token.length + ' chars)' : 'NOT SET'}`);
  console.log(`  ct0:        ${u.ct0 ? u.ct0.slice(0, 8) + '…(' + u.ct0.length + ' chars)' : 'NOT SET'}`);

  if (!u.auth_token || !u.ct0) {
  console.log('  → SKIP: cookies missing.\n');
  continue;
  }

  const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  Cookie: `auth_token=${u.auth_token}; ct0=${u.ct0}`,
  'X-Csrf-Token': u.ct0,
  'X-Twitter-Auth-Type': 'OAuth2Session',
  'Content-Type': 'application/json',
  };

  const features = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  };

  // Probe UserByScreenName (same as agent's verify_x_credentials)
  const url = `https://api.twitter.com/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${encodeURIComponent(
  JSON.stringify({ screen_name: 'twitter', withSafetyModeUserFields: true }),
  )}&features=${encodeURIComponent(JSON.stringify(features))}`;

  // Helper: probe and report.
  async function probe(label, probeUrl) {
  const t0 = Date.now();
  let fetchRes, fetchErr;
  try {
  fetchRes = await fetch(probeUrl, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
  fetchErr = e;
  }
  const ms = Date.now() - t0;
  if (fetchErr) {
  console.log(`  [${label}] → NETWORK ERROR in ${ms}ms: ${fetchErr.message || fetchErr}`);
  return null;
  }
  const status = fetchRes.status;
  const raw = await fetchRes.text().catch(() => '<unreadable>');
  const truncated = raw.slice(0, 200).replace(/\s+/g, ' ').trim();
  console.log(`  [${label}] → HTTP ${status} in ${ms}ms`);
  console.log(`            body[:200]: ${truncated}`);
  return { status, raw };
  }

  // Probe 1: UserByScreenName (cookie sanity check)
  const probe1 = await probe('UserByScreenName', url);
  console.log();
  tested++;

  if (!probe1 || probe1.status !== 200) {
  console.log('  → UserByScreenName failed; skipping SearchTimeline probe.\n');
  continue;
  }

  // Probe 2: SearchTimeline (the actual endpoint that 404'd)
  const searchUrl = `https://api.twitter.com/graphql/hz_94eVAtrtQo_vO3my7Rw/SearchTimeline?variables=${encodeURIComponent(
  JSON.stringify({
  rawQuery: 'AI agents',
  count: 5,
  querySource: 'typed_query',
  product: 'Latest',
  }),
  )}&features=${encodeURIComponent(JSON.stringify(features))}`;
  const probe2 = await probe('SearchTimeline ', searchUrl);
  console.log();

  if (probe2?.status === 200) {
  try {
  const data = JSON.parse(probe2.raw);
  const tweets = data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions?.[0]?.entries;
  const n = Array.isArray(tweets) ? tweets.length : 0;
  console.log(`  ✅ SearchTimeline WORKS — got ${n} tweet entries in the timeline.`);
  } catch {
  console.log('  ⚠️  SearchTimeline 200 but unexpected shape.');
  }
  } else if (probe2?.status === 404) {
  console.log('  ❌ SearchTimeline returns 404 — the query hash is dead.');
  console.log('     → This is X rotating the GraphQL hash. Need to find the current one.');
  console.log('     → Run from a browser DevTools on x.com to capture the new hash.');
  } else if (probe2?.status === 401 || probe2?.status === 403) {
  console.log('  ❌ SearchTimeline auth rejected. Cookies work for some endpoints but not this one.');
  }
  console.log();
}

console.log('━'.repeat(70));
console.log(`Tested ${tested} user(s)${skipped ? `, skipped ${skipped} (filter "${filter}")` : ''}.`);

await db.end();
