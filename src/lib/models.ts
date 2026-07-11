/**
 * Model catalog — safe to import from client components.
 *
 * The OpenAI / DeepSeek client lives in `src/lib/llm.ts` and runs
 * `new OpenAI({...})` at module evaluation, which throws if the bundle
 * is ever evaluated in a browser. So all client-facing model metadata
 * (the dropdown, the picker, the default) is defined here instead,
 * and `llm.ts` re-exports these values for server use.
 *
 * Probed 2026-07-11: deepseek-v4-pro and deepseek-v4-flash are the two
 * currently supported model names. deepseek-chat / deepseek-reasoner /
 * deepseek-coder are aliases that still resolve but DeepSeek recommends
 * the v4-* names going forward. deepseek-v3 is rejected.
 */

export const MODELS = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4-flash',
    description: '更便宜更快,日常运营够用',
    badge: '快',
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4-pro',
    description: '更聪明,适合复杂策略/创意',
    badge: '强',
  },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const DEFAULT_MODEL: ModelId = 'deepseek-v4-flash';

export const MODEL_STORAGE_KEY = 'vp_model';

export function getModel(id: string | undefined): ModelId {
  return id === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : DEFAULT_MODEL;
}
