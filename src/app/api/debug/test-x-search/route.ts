/**
 * TEMP DEBUG ENDPOINT — diagnose which X GraphQL URL works from Vercel.
 *
 * Why this exists: my local machine is firewalled and can't reach X, but
 * Vercel can. The agent in prod was getting 404 on SearchTimeline, and
 * we couldn't tell from outside whether it was the hash, path, host, or
 * features that was wrong. This endpoint runs the same request in Vercel's
 * network and reports which URL variant actually returns 200.
 *
 * REMOVE THIS AFTER FIXING X SEARCH. Not part of the agent's runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { currentSessionIdServer } from '@/lib/auth';
import { userFromSession } from '@/lib/auth';
import { getCred } from '@/lib/tools';
import { X_FEATURES } from '@/lib/tools';

const QUERY_HASH = 'hz_94eVAtrtQo_vO3my7Rw';
const VARIABLES = {
  rawQuery: 'AI',
  count: 20,
  querySource: 'typed_query',
  product: 'Top',
  withGrokTranslatedBio: true,
  withQuickPromoteEligibilityTweetFields: false,
};

function buildFeatures(): string {
  return JSON.stringify(X_FEATURES);
}

function buildVariables(): string {
  return JSON.stringify(VARIABLES);
}

type Variant = {
  label: string;
  url: string;
};

function variants(): Variant[] {
  const v = encodeURIComponent(buildVariables());
  const f = encodeURIComponent(buildFeatures());
  const ft = encodeURIComponent(JSON.stringify({}));
  const baseParams = `variables=${v}&features=${f}&fieldToggles=${ft}`;

  return [
    {
      label: 'A. x.com + /i/api/graphql/ (user captured exactly)',
      url: `https://x.com/i/api/graphql/${QUERY_HASH}/SearchTimeline?${baseParams}`,
    },
    {
      label: 'B. api.twitter.com + /i/api/graphql/ (current code path)',
      url: `https://api.twitter.com/i/api/graphql/${QUERY_HASH}/SearchTimeline?${baseParams}`,
    },
    {
      label: 'C. api.twitter.com + /graphql/ (old legacy path)',
      url: `https://api.twitter.com/graphql/${QUERY_HASH}/SearchTimeline?${baseParams}`,
    },
    {
      label: 'D. x.com + /graphql/ (new host, old path)',
      url: `https://x.com/graphql/${QUERY_HASH}/SearchTimeline?${baseParams}`,
    },
  ];
}

export async function POST(request: NextRequest) {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authToken = await getCred(user.id, 'x.auth_token', 'X_AUTH_TOKEN');
  const ct0 = await getCred(user.id, 'x.ct0', 'X_CT0');
  if (!authToken || !ct0) {
  return NextResponse.json({ error: 'X cookies not configured' }, { status: 400 });
  }

  const headers: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  Cookie: `auth_token=${authToken}; ct0=${ct0}`,
  'X-Csrf-Token': ct0,
  'X-Twitter-Auth-Type': 'OAuth2Session',
  'Content-Type': 'application/json',
  };

  const results: Array<{
  label: string;
  url: string;
  status: number | null;
  ms: number;
  body_preview: string;
  body_is_json: boolean;
  tweet_count: number | null;
  error: string | null;
  }> = [];

  for (const v of variants()) {
  const t0 = Date.now();
  let res: Response | null = null;
  let fetchErr: unknown = null;
  try {
  res = await fetch(v.url, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
  fetchErr = e;
  }
  const ms = Date.now() - t0;

  if (fetchErr) {
  results.push({
  label: v.label,
  url: v.url,
  status: null,
  ms,
  body_preview: '',
  body_is_json: false,
  tweet_count: null,
  error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
  });
  continue;
  }

  const status = res!.status;
  const raw = await res!.text().catch(() => '<unreadable>');
  const preview = raw.slice(0, 200).replace(/\s+/g, ' ').trim();
  let isJson = false;
  let tweetCount: number | null = null;
  try {
  const parsed = JSON.parse(raw);
  isJson = true;
  const entries = parsed?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions?.[0]?.entries;
  tweetCount = Array.isArray(entries) ? entries.length : 0;
  } catch {}

  results.push({
  label: v.label,
  url: v.url,
  status,
  ms,
  body_preview: preview,
  body_is_json: isJson,
  tweet_count: tweetCount,
  error: null,
  });
  }

  return NextResponse.json({
  ok: true,
  query_hash: QUERY_HASH,
  feature_count: Object.keys(X_FEATURES).length,
  results,
  });
}
