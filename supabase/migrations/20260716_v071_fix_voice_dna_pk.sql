-- 修复:vp_voice_dna 应该支持多版本,user_id 不应该是 PRIMARY KEY
-- 改用 (user_id, version) 唯一约束

ALTER TABLE public.vp_voice_dna
  DROP CONSTRAINT IF EXISTS vp_voice_dna_pkey;

ALTER TABLE public.vp_voice_dna
  ADD CONSTRAINT vp_voice_dna_user_version_unique UNIQUE (user_id, version);

CREATE INDEX IF NOT EXISTS idx_voice_dna_active
  ON public.vp_voice_dna(user_id, version DESC) WHERE outdated_at IS NULL;
