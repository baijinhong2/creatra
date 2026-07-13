/**
 * Public API for system prompts.
 *
 * `buildSystemPrompt({ mode })` returns BASE + the selected mode overlay.
 * The chat API calls this per-turn so that the agent's behavior matches
 * the conversation's mode.
 *
 * Backward-compat: AGENT_SYSTEM_PROMPT is still exported (defaults to
 * mode=expert) for any code path that doesn't pass a mode explicitly.
 * This keeps older call sites working while we migrate.
 */

import { BASE_SYSTEM_PROMPT } from './base';
import { MODE_OVERLAY, type ConvMode } from './modes';

export type { ConvMode };

export function buildSystemPrompt(opts: { mode?: ConvMode } = {}): string {
  const mode: ConvMode = opts.mode ?? 'expert';
  return BASE_SYSTEM_PROMPT + '\n' + MODE_OVERLAY[mode];
}

// Default (for backward compat with code that doesn't pass a mode).
// We pick 'expert' (not 'auto') as the default so that any pre-mode code
// still gets a clear, stable behavior. Chat API explicitly passes mode.
export const AGENT_SYSTEM_PROMPT = buildSystemPrompt({ mode: 'expert' });
