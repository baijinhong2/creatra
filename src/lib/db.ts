/**
 * Direct Postgres connection (bypasses Supabase PostgREST).
 *
 * Why not @supabase/supabase-js here:
 *   When tables are created via raw SQL (DRAWING via `pg` instead of the
 *   dashboard SQL editor), Supabase's PostgREST schema cache doesn't always
 *   pick them up, and it returns
 *     `Could not query the database for the schema cache. Retrying.`
 *   on every operation — making the JS client unusable.
 *
 * Going through `pg` directly is more reliable for this MVP and removes
 * one indirection (no RLS for now — auth comes later).
 *
 * Pool is reused across requests inside a single Node process.
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set; persistence disabled.');
}

let pool: Pool | null = null;

export function getDb(): Pool | null {
  if (!DATABASE_URL) return null;
  if (pool) return pool;
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

/** Table name registry — duplicated from supabase.ts to avoid coupling. */
export const TABLE = {
  users: 'vp_users',
  sessions: 'vp_sessions',
  conversations: 'vp_conversations',
  messages: 'vp_messages',
  accountProfile: 'vp_account_profile',
  preferences: 'vp_user_preferences',
  tweetHistory: 'vp_tweet_history',
  engagementEvents: 'vp_engagement_events',
  similarCreators: 'vp_similar_creators',
  projects: 'vp_user_projects',
  insights: 'vp_insights',
} as const;
