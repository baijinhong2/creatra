-- ========================================================================
-- viralpost — Supabase schema
--
-- Tables live in the `public` schema (Supabase default) but with `vp_` prefix
-- to keep them visually distinct from drawspark tables that share this database.
--
-- v0.3: multi-user. `vp_users` + `vp_sessions` + user_id on every domain
-- table. Per-user data isolation.
-- ========================================================================

-- ── Auth ────────────────────────────────────────────────────────────────
create table if not exists public.vp_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vp_sessions (
  id text primary key,                     -- 64-char hex random token
  user_id uuid not null references public.vp_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists vp_sessions_user_idx
  on public.vp_sessions (user_id);

-- ── Domain tables (now per-user) ──────────────────────────────────────

create table if not exists public.vp_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.vp_users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vp_conversations_updated_at_idx
  on public.vp_conversations (updated_at desc);

create index if not exists vp_conversations_user_idx
  on public.vp_conversations (user_id);

create table if not exists public.vp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.vp_conversations(id) on delete cascade,
  user_id uuid references public.vp_users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vp_messages_conv_created_idx
  on public.vp_messages (conversation_id, created_at);

create index if not exists vp_messages_user_idx
  on public.vp_messages (user_id);

-- v0.3 schema change: PK is now (user_id, key) instead of just `key`.
-- If migrating from a pre-v0.3 DB, the old single-column PK has to be
-- dropped first. See /supabase/migrations/ for the upgrade script.

create table if not exists public.vp_user_preferences (
  user_id uuid not null references public.vp_users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists vp_user_preferences_user_idx
  on public.vp_user_preferences (user_id);

-- ── User insights (v0.4) ───────────────────────────────────────────────
-- Captured reflections, project breakdowns, methods, discoveries — the
-- raw material that daily content (Skill 5) draws from. Per-user scoped.
create table if not exists public.vp_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vp_users(id) on delete cascade,
  kind text not null check (kind in ('reflection', 'project_breakdown', 'method', 'discovery', 'sharing', 'fragment')),
  title text not null,
  body text not null,
  tags text[] default '{}',
  source_conversation_id uuid references public.vp_conversations(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vp_insights_user_idx
  on public.vp_insights (user_id);
create index if not exists vp_insights_user_kind_idx
  on public.vp_insights (user_id, kind);
create index if not exists vp_insights_user_created_idx
  on public.vp_insights (user_id, created_at desc);

-- ========================================================================
-- Future tables (declared in src/lib/db.ts). Uncomment when features ship.
-- ========================================================================

-- create table if not exists public.vp_account_profile (
--   user_id uuid primary key references public.vp_users(id) on delete cascade,
--   niche text,
--   positioning text,
--   target_audience text,
--   voice_tone text,
--   language text default 'en',
--   updated_at timestamptz not null default now()
-- );

-- create table if not exists public.vp_tweet_history (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid not null references public.vp_users(id) on delete cascade,
--   text text not null,
--   angle text,
--   hook text,
--   posted_at timestamptz,
--   impressions int default 0,
--   likes int default 0,
--   replies int default 0,
--   reposts int default 0,
--   profile_refs int default 0,
--   created_at timestamptz not null default now()
-- );

-- create table if not exists public.vp_engagement_events (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid not null references public.vp_users(id) on delete cascade,
--   tweet_id uuid references public.vp_tweet_history(id) on delete cascade,
--   metric text not null,
--   value int not null,
--   measured_at timestamptz not null default now()
-- );

-- create table if not exists public.vp_similar_creators (
--   user_id uuid not null references public.vp_users(id) on delete cascade,
--   handle text not null,
--   reason text,
--   added_at timestamptz not null default now(),
--   primary key (user_id, handle)
-- );

-- create table if not exists public.vp_user_projects (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid not null references public.vp_users(id) on delete cascade,
--   name text not null,
--   source text not null check (source in ('github', 'local', 'manual')),
--   path text,
--   description text,
--   tags text[] default '{}',
--   metadata jsonb default '{}'::jsonb,
--   added_at timestamptz not null default now()
-- );

-- ========================================================================
-- Row-level security — open for MVP, scoped only via service-role key
-- (the app filters by user_id in code; tighten later when audit is easier).
-- ========================================================================

alter table public.vp_users enable row level security;
alter table public.vp_sessions enable row level security;
alter table public.vp_conversations enable row level security;
alter table public.vp_messages enable row level security;
alter table public.vp_user_preferences enable row level security;

drop policy if exists "vp_all_anon" on public.vp_users;
create policy "vp_all_anon"
  on public.vp_users for all
  to anon, authenticated, service_role
  using (true) with check (true);

drop policy if exists "vp_all_anon" on public.vp_sessions;
create policy "vp_all_anon"
  on public.vp_sessions for all
  to anon, authenticated, service_role
  using (true) with check (true);

drop policy if exists "vp_all_anon" on public.vp_conversations;
create policy "vp_all_anon"
  on public.vp_conversations for all
  to anon, authenticated, service_role
  using (true) with check (true);

drop policy if exists "vp_all_anon" on public.vp_messages;
create policy "vp_all_anon"
  on public.vp_messages for all
  to anon, authenticated, service_role
  using (true) with check (true);

drop policy if exists "vp_all_anon" on public.vp_user_preferences;
create policy "vp_all_anon"
  on public.vp_user_preferences for all
  to anon, authenticated, service_role
  using (true) with check (true);

alter table public.vp_insights enable row level security;
drop policy if exists "vp_all_anon" on public.vp_insights;
create policy "vp_all_anon"
  on public.vp_insights for all
  to anon, authenticated, service_role
  using (true) with check (true);
