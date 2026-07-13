/**
 * Re-exports from the new modular prompt system at ./prompts/.
 * Kept for backward compat — new code should import from ./prompts
 * directly.
 */

export {
  buildSystemPrompt,
  AGENT_SYSTEM_PROMPT,
  type ConvMode,
} from './prompts/index';

export { PLAN_GENERATION_PROMPT } from './prompts/plan';
