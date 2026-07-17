-- ========================================================================
-- 2026-07-17: 创作者关注列表 (user creators watch)
-- 用户关注/对标/经常提到的 X 博主列表
-- ========================================================================

create table if not exists public.vp_user_creators (
  id bigserial primary key,
  user_id uuid not null references public.vp_users(id) on delete cascade,
  handle text not null,                           -- 'naval' (no @)
  display_name text,                              -- 'Naval Ravikant'
  reason text,                                    -- '我的对标,深度思考型'
  source text not null default 'user'             -- 'user' / 'agent_suggested' / 'auto_detected'
    check (source in ('user', 'agent_suggested', 'auto_detected')),
  weight int not null default 1,                  -- higher = more important
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, handle)
);

create index if not exists idx_user_creators_user
  on public.vp_user_creators(user_id, weight desc, created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.vp_user_creators enable row level security;

drop policy if exists vp_user_creators_select_own on public.vp_user_creators;
create policy vp_user_creators_select_own on public.vp_user_creators
  for select using (auth.uid() = user_id);

drop policy if exists vp_user_creators_insert_own on public.vp_user_creators;
create policy vp_user_creators_insert_own on public.vp_user_creators
  for insert with check (auth.uid() = user_id);

drop policy if exists vp_user_creators_update_own on public.vp_user_creators;
create policy vp_user_creators_update_own on public.vp_user_creators
  for update using (auth.uid() = user_id);

drop policy if exists vp_user_creators_delete_own on public.vp_user_creators;
create policy vp_user_creators_delete_own on public.vp_user_creators
  for delete using (auth.uid() = user_id);
