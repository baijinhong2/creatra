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

  const url = `https://api.twitter.com/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${encodeURIComponent(
  JSON.stringify({ screen_name: 'twitter', withSafetyModeUserFields: true }),
  )}`;

  const t0 = Date.now();
  let fetchRes, fetchErr;
  try {
  fetchRes = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
  fetchErr = e;
  }
  const ms = Date.now() - t0;

  if (fetchErr) {
  console.log(`  → NETWORK ERROR in ${ms}ms: ${fetchErr.message || fetchErr}`);
  console.log('     (Vercel → api.twitter.com path may be blocked from this region)\n');
  tested++;
  continue;
  }

  const status = fetchRes.status;
  const raw = await fetchRes.text().catch(() => '<unreadable>');
  const truncated = raw.slice(0, 200).replace(/\s+/g, ' ').trim();

  console.log(`  → HTTP ${status} in ${ms}ms`);
  console.log(`     body[:200]: ${truncated}`);

  if (status === 200) {
  try {
  const data = JSON.parse(raw);
  const handle = data?.data?.user?.result?.legacy?.screen_name;
  if (handle) {
  console.log(`  ✅ DIAGNOSIS: cookies are WORKING (probed @${handle})`);
  } else {
  console.log(`  ⚠️  DIAGNOSIS: 200 but unexpected shape`);
  }
  } catch {
  const html = /^<(!doctype|html)/i.test(raw.trim());
  if (html) {
  console.log('  ❌ DIAGNOSIS: X returned 200 but with an HTML anti-bot challenge page.');
  console.log('     Cookies themselves are FINE. The Vercel datacenter IP is being challenged.');
  console.log('     → The X integration will not work from this deployment.');
  console.log('     → Solutions: deploy behind a residential proxy, or self-host the app.');
  } else {
  console.log('  ⚠️  DIAGNOSIS: 200 but non-JSON, non-HTML');
  }
  }
  } else if (status === 401 || status === 403) {
  console.log(`  ❌ DIAGNOSIS: cookies are EXPIRED/INVALID. Re-extract auth_token + ct0 from x.com.`);
  } else if (status === 429) {
  console.log(`  ⚠️  DIAGNOSIS: X rate-limited this IP. Cookies are fine, just back off.`);
  } else if (status >= 500) {
  console.log(`  ⚠️  DIAGNOSIS: X server error (5xx). Try again later.`);
  } else {
  console.log(`  ⚠️  DIAGNOSIS: unexpected status ${status}`);
  }
  console.log();
  tested++;
}

console.log('━'.repeat(70));
console.log(`Tested ${tested} user(s)${skipped ? `, skipped ${skipped} (filter "${filter}")` : ''}.`);

await db.end();
