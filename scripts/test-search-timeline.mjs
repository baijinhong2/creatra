#!/usr/bin/env node
/**
 * Test the EXACT URL the user captured from x.com DevTools, plus a couple
 * variations to figure out which piece (path, features, host) is the deal-breaker.
 *
 * Usage:
 *   node scripts/test-search-timeline.mjs <auth_token> <ct0>
 */
const authToken = process.argv[2];
const ct0 = process.argv[3];

if (!authToken || !ct0) {
  console.error('Usage: node scripts/test-search-timeline.mjs <auth_token> <ct0>');
  process.exit(1);
}

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  Cookie: `auth_token=${authToken}; ct0=${ct0}`,
  'X-Csrf-Token': ct0,
  'X-Twitter-Auth-Type': 'OAuth2Session',
  'Content-Type': 'application/json',
};

// The exact URL the user captured from x.com DevTools, 100% verbatim.
const EXACT_URL = 'https://x.com/i/api/graphql/hz_94eVAtrtQo_vO3my7Rw/SearchTimeline?variables=%7B%22rawQuery%22%3A%22AI%22%2C%22count%22%3A20%2C%22querySource%22%3A%22typed_query%22%2C%22product%22%3A%22Top%22%2C%22withGrokTranslatedBio%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Afalse%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22rweb_cashtags_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Atrue%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22rweb_cashtags_composer_attachment_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22rweb_conversational_replies_downvote_enabled%22%3Afalse%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22content_disclosure_indicator_enabled%22%3Atrue%2C%22content_disclosure_ai_generated_indicator_enabled%22%3Atrue%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Afalse%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Atrue%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D';

const tests = [
  { label: 'A. EXACT URL (verbatim from x.com DevTools)', url: EXACT_URL },
  { label: 'B. Same URL but host=api.twitter.com', url: EXACT_URL.replace('https://x.com', 'https://api.twitter.com') },
  { label: 'C. api.twitter.com + /graphql/ (old path, current code)', url: EXACT_URL.replace('https://x.com/i/api/graphql', 'https://api.twitter.com/graphql') },
  { label: 'D. x.com + /graphql/ (new host, old path)', url: EXACT_URL.replace('/i/api/graphql', '/graphql') },
];

for (const t of tests) {
  console.log('━'.repeat(70));
  console.log(t.label);
  console.log(`  URL[:120]: ${t.url.slice(0, 120)}…`);

  const t0 = Date.now();
  let res, err;
  try {
    res = await fetch(t.url, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    err = e;
  }
  const ms = Date.now() - t0;

  if (err) {
    console.log(`  → NETWORK ERROR in ${ms}ms: ${err.message || err}`);
    continue;
  }

  const status = res.status;
  const raw = await res.text().catch(() => '<unreadable>');
  const truncated = raw.slice(0, 250).replace(/\s+/g, ' ').trim();

  console.log(`  → HTTP ${status} in ${ms}ms`);
  console.log(`     body[:250]: ${truncated}`);

  if (status === 200) {
    try {
      const data = JSON.parse(raw);
      const entries = data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions?.[0]?.entries;
      console.log(`  ✅ ${Array.isArray(entries) ? entries.length : 0} tweet entries returned`);
    } catch {
      console.log('  ⚠️  200 but non-JSON');
    }
  } else {
    console.log(`  ❌ FAIL`);
  }
  console.log();
}
