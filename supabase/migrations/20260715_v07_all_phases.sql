-- ========================================================================
-- v0.7 优化:Voice DNA + Outcomes + Engagement + Intelligence + Cross-post
-- 整合 4 个 phase 的表结构变更
-- ========================================================================

-- ── Phase 0.1: Voice DNA ────────────────────────────────────────────────
create table if not exists public.vp_voice_dna (
  user_id uuid primary key references public.vp_users(id) on delete cascade,
  source_type text not null check (source_type in (
    'own_tweets', 'reference_handles', 'preset_template', 'quiz', 'freeform'
  )),
  source_meta jsonb,
  source_tweet_count int default 0,
  features jsonb not null,
  confidence real default 1.0,
  sample_tweets jsonb,
  version int default 1,
  last_extracted_at timestamptz default now(),
  outdated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Phase 0.2: User Tweets (Outcomes Loop) ──────────────────────────────
create table if not exists public.vp_user_tweets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  tweet_id text,
  tweet_url text,
  tweet_text text not null,
  source text not null check (source in ('agent_draft', 'user_wrote', 'mixed')),
  draft_session_id uuid,
  draft_message_id uuid,
  marked_at timestamptz default now(),
  marked_published_at timestamptz,
  metrics jsonb,
  metrics_pulled_at timestamptz,
  metrics_version int default 0,
  status text default 'pending' check (status in ('pending', 'pulled', 'failed', 'skipped', 'demo')),
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_tweets_user
  on public.vp_user_tweets(user_id, marked_at desc);
create index if not exists idx_user_tweets_pending
  on public.vp_user_tweets(status, marked_at) where status = 'pending';

-- ── Phase 1: Reply Inbox + Mention Inbox ────────────────────────────────
create table if not exists public.vp_reply_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  parent_tweet_id text not null,
  parent_tweet_text text not null,
  parent_tweet_url text,
  reply_tweet_id text not null unique,
  reply_author_handle text,
  reply_author_name text,
  reply_author_avatar text,
  reply_text text not null,
  reply_metrics jsonb,
  pulled_at timestamptz default now(),
  status text default 'new' check (status in ('new', 'drafted', 'handled', 'skipped')),
  drafted_response text,
  draft_meta jsonb,
  handled_at timestamptz,
  handled_draft_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reply_inbox_user_status
  on public.vp_reply_inbox(user_id, status, pulled_at desc);

create table if not exists public.vp_mention_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  mention_tweet_id text not null unique,
  mention_author_handle text,
  mention_author_name text,
  mention_author_avatar text,
  mention_text text not null,
  mention_context text,
  mention_metrics jsonb,
  pulled_at timestamptz default now(),
  status text default 'new' check (status in ('new', 'drafted', 'handled', 'skipped', 'not_a_mention')),
  drafted_response text,
  handled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_mention_inbox_user_status
  on public.vp_mention_inbox(user_id, status, pulled_at desc);

-- ── Phase 1: Users 加 x_handle 和 last sync ─────────────────────────────
alter table public.vp_users add column if not exists x_handle text;
alter table public.vp_users add column if not exists last_engagement_synced_at timestamptz;

-- ── Phase 2: Topic Recommendations + Health Reports + Dismissed ─────────
create table if not exists public.vp_topic_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  date date not null,
  main_recommendation jsonb not null,
  alternatives jsonb,
  trends jsonb,
  no_significant_trend boolean default false,
  feedback text,
  feedback_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_topic_recs_user_date
  on public.vp_topic_recommendations(user_id, date);
create index if not exists idx_topic_recs_user_date_desc
  on public.vp_topic_recommendations(user_id, date desc);

create table if not exists public.vp_health_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  report jsonb not null,
  generated_at timestamptz default now()
);

create unique index if not exists idx_health_user_week
  on public.vp_health_reports(user_id, week_start);
create index if not exists idx_health_user_week_desc
  on public.vp_health_reports(user_id, week_start desc);

create table if not exists public.vp_dismissed_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  insight_signature text not null,
  insight_text text not null,
  insight_type text,
  dismissed_at timestamptz default now()
);

create unique index if not exists idx_dismissed_user_sig
  on public.vp_dismissed_insights(user_id, insight_signature);

-- ── Phase 3: Onboarding State + Cross-post Rewrites ─────────────────────
create table if not exists public.vp_onboarding_state (
  user_id uuid primary key references public.vp_users(id) on delete cascade,
  current_step int default 1,
  step_1_data jsonb,
  step_2_data jsonb,
  step_3_data jsonb,
  step_4_data jsonb,
  voice_dna_id uuid,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vp_cross_post_rewrites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  source_tweet text not null,
  source_url text,
  platform text not null check (platform in ('jike', 'xiaohongshu', 'linkedin')),
  rewritten_text text not null,
  style_notes text,
  char_count int,
  hashtags text[],
  source_attribution text,
  copied_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_cross_post_user
  on public.vp_cross_post_rewrites(user_id, created_at desc);

-- ── RLS policies(全部开放,代码层做 user_id 隔离)───────────────────────
alter table public.vp_voice_dna enable row level security;
drop policy if exists "vp_all_anon" on public.vp_voice_dna;
create policy "vp_all_anon" on public.vp_voice_dna for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_user_tweets enable row level security;
drop policy if exists "vp_all_anon" on public.vp_user_tweets;
create policy "vp_all_anon" on public.vp_user_tweets for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_reply_inbox enable row level security;
drop policy if exists "vp_all_anon" on public.vp_reply_inbox;
create policy "vp_all_anon" on public.vp_reply_inbox for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_mention_inbox enable row level security;
drop policy if exists "vp_all_anon" on public.vp_mention_inbox;
create policy "vp_all_anon" on public.vp_mention_inbox for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_topic_recommendations enable row level security;
drop policy if exists "vp_all_anon" on public.vp_topic_recommendations;
create policy "vp_all_anon" on public.vp_topic_recommendations for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_health_reports enable row level security;
drop policy if exists "vp_all_anon" on public.vp_health_reports;
create policy "vp_all_anon" on public.vp_health_reports for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_dismissed_insights enable row level security;
drop policy if exists "vp_all_anon" on public.vp_dismissed_insights;
create policy "vp_all_anon" on public.vp_dismissed_insights for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_onboarding_state enable row level security;
drop policy if exists "vp_all_anon" on public.vp_onboarding_state;
create policy "vp_all_anon" on public.vp_onboarding_state for all
  to anon, authenticated, service_role using (true) with check (true);

alter table public.vp_cross_post_rewrites enable row level security;
drop policy if exists "vp_all_anon" on public.vp_cross_post_rewrites;
create policy "vp_all_anon" on public.vp_cross_post_rewrites for all
  to anon, authenticated, service_role using (true) with check (true);
