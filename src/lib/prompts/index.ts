/**
 * Public API for system prompts.
 *
 * `buildSystemPrompt({ mode, userId })` returns BASE + mode overlay + voice DNA.
 * The chat API calls this per-turn so that the agent's behavior matches
 * the conversation's mode AND the user's voice DNA.
 *
 * Backward-compat: AGENT_SYSTEM_PROMPT is still exported (defaults to
 * mode=expert, no DNA) for any code path that doesn't pass a userId.
 */

import { BASE_SYSTEM_PROMPT } from'./base';
import { MODE_OVERLAY, type ConvMode } from'./modes';
import { loadUserDna, dnaToPromptSection } from'../voiceDnaStore';
import { getOutcomesForPrompt } from'../outcomesStore';

export type { ConvMode };

export async function buildSystemPrompt(
 opts: { mode?: ConvMode; userId?: string } = {},
): Promise<string> {
 const mode: ConvMode = opts.mode ??'expert';
 let dnaSection ='';
 let outcomesSection ='';
 if (opts.userId) {
 try {
 const dna = await loadUserDna(opts.userId);
 dnaSection = dnaToPromptSection(dna);
 } catch (e) {
 console.warn('[prompts] failed to load DNA:', e);
 }
 try {
 outcomesSection = await getOutcomesForPrompt(opts.userId);
 } catch (e) {
 console.warn('[prompts] failed to load outcomes:', e);
 }
 }
 return BASE_SYSTEM_PROMPT +'\n'+ MODE_OVERLAY[mode] + dnaSection + outcomesSection;
}

// Default (for backward compat with code that doesn't pass a mode).
// We pick'expert'(not'auto') as the default so that any pre-mode code
// still gets a clear, stable behavior. Chat API explicitly passes mode.
// Note: this is a Promise<string> because buildSystemPrompt is async
// (loads voice DNA). Old callers that need sync content should switch
// to `await buildSystemPrompt({...})` instead.
export const AGENT_SYSTEM_PROMPT: Promise<string> = buildSystemPrompt({ mode:'expert'});
