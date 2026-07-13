-- ─────────────────────────────────────────────────────────────────────
-- v0.5: per-conversation interaction mode
-- ─────────────────────────────────────────────────────────────────────
-- Adds `mode` column to vp_conversations so each conversation can be
-- run in `auto` / `expert` / `assistant` mode independently.
--
-- Default: 'auto' (agent judges per turn).
-- Mode is sticky: once a user explicitly picks expert or assistant, the
-- mode stays for the rest of the conversation until they switch again.
--
-- This is per-CONVERSATION not per-USER: the same user can be a beginner
-- in one topic and an expert in another, and the agent uses the right
-- tone for the current conversation.
-- ─────────────────────────────────────────────────────────────────────

alter table public.vp_conversations
  add column if not exists mode text not null default 'auto'
    check (mode in ('auto', 'expert', 'assistant'));

create index if not exists vp_conversations_mode_idx
  on public.vp_conversations (user_id, mode)
  where mode <> 'auto';
