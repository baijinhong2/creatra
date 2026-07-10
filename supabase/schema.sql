-- ========================================================================
-- viralpost — Supabase schema
--
-- Tables live in the `public` schema (Supabase default) but with `vp_` prefix
-- to keep them visually distinct from drawspark tables that share this database.
--
-- MVP scope: just `vp_conversations` + `vp_messages` so we can persist
-- chat history beyond a single browser session. Other tables are placeholders
-- declared in src/lib/supabase.ts for future use.
-- ========================================================================

-- v1: chat conversations (one per browser session, or one per topic)
create table if not exists public.vp_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Single-user MVP: no user_id column yet. Add when auth is wired.
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vp_conversations_updated_at_idx
  on public.vp_conversations (updated_at desc);

-- v1: chat messages — append-only log per conversation.
-- `role` matches the agent's ChatMessage type: user | assistant | system | tool.
-- `metadata` holds tool_calls / tool_call_id / tool_name as JSONB so we can
-- replay agent steps later.
create table if not exists public.vp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.vp_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vp_messages_conv_created_idx
  on public.vp_messages (conversation_id, created_at);

-- v2: KV-style preferences store. The agent reads here on every turn for
-- credentials (e.g. github.token) and writes here when the user shares
-- personal facts (account.niche, voice.tone, etc.). Tools in src/lib/tools.ts
-- treat keys ending in `.token | .key | .secret | .auth_token | .ct0 |
-- .password` as secret — values get redacted on read_preferences and in logs.
create table if not exists public.vp_user_preferences (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ========================================================================
-- Future tables (declared in src/lib/supabase.ts). Uncomment when features ship.
-- ========================================================================

-- create table if not exists public.vp_account_profile (
--   id uuid primary key default gen_random_uuid(),
--   niche text,
--   positioning text,
--   target_audience text,
--   voice_tone text,
--   language text default 'en',
--   updated_at timestamptz not null default now()
-- );

-- v3: tweet history — what the agent has suggested/posted, for learning loops.
-- create table if not exists public.vp_tweet_history (
--   id uuid primary key default gen_random_uuid(),
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

-- v3: engagement events for tweets the agent drafts (impressions / likes / etc.).
-- create table if not exists public.vp_engagement_events (
--   id uuid primary key default gen_random_uuid(),
--   tweet_id uuid references public.vp_tweet_history(id) on delete cascade,
--   metric text not null,
--   value int not null,
--   measured_at timestamptz not null default now()
-- );

-- v2: similar creators the user follows / wants to follow.
-- create table if not exists public.vp_similar_creators (
--   id uuid primary key default gen_random_uuid(),
--   handle text unique not null,
--   reason text,
--   added_at timestamptz not null default now()
-- );

-- v2: user's local/GitHub projects (for build-in-public content).
-- create table if not exists public.vp_user_projects (
--   id uuid primary key default gen_random_uuid(),
--   name text not null,
--   source text not null check (source in ('github', 'local', 'manual')),
--   path text,
--   description text,
--   tags text[] default '{}',
--   metadata jsonb default '{}'::jsonb,
--   added_at timestamptz not null default now()
-- );

-- ========================================================================
-- Row-level security — open for MVP single-user mode. Lock down when auth ships.
-- ========================================================================

alter table public.vp_conversations enable row level security;
alter table public.vp_messages enable row level security;
alter table public.vp_user_preferences enable row level security;

-- MVP policy: anon + service_role have full access. Tighten when auth is wired.
drop policy if exists "vp_all_anon" on public.vp_conversations;
create policy "vp_all_anon"
  on public.vp_conversations
  for all
  to anon, authenticated, service_role
  using (true) with check (true);

drop policy if exists "vp_all_anon" on public.vp_messages;
create policy "vp_all_anon"
  on public.vp_messages
  for all
  to anon, authenticated, service_role
  using (true) with check (true);

drop policy if exists "vp_all_anon" on public.vp_user_preferences;
create policy "vp_all_anon"
  on public.vp_user_preferences
  for all
  to anon, authenticated, service_role
  using (true) with check (true);
