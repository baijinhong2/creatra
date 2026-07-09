import { createClient } from '@supabase/supabase-js';

/**
 * Viralpost uses drawspark's Supabase project but a dedicated schema (vp_*)
 * to keep all data isolated. See supabase/schema.sql for the table definitions.
 *
 * Two clients:
 * - getSupabaseClient() (anon, safe in client components)
 * - getSupabaseAdmin() (service role, server-only, bypasses RLS)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Don't crash on import — the chat UI can still run without persistence.
  console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL or ANON_KEY not set; persistence disabled.');
}

export function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** All viralpost tables live under this schema prefix. */
export const TABLE = {
  conversations: 'vp_conversations',
  messages: 'vp_messages',
  accountProfile: 'vp_account_profile',
  preferences: 'vp_user_preferences',
  tweetHistory: 'vp_tweet_history',
  engagementEvents: 'vp_engagement_events',
  similarCreators: 'vp_similar_creators',
  projects: 'vp_user_projects',
} as const;