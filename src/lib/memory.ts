/**
 * Memory utilities for the agent.
 *
 * For the MVP, conversation memory lives entirely on the client (React state).
 * The client posts the full conversation history to /api/chat on each request;
 * the server is stateless.
 *
 * Persisted memory (account profile, preferences, tweet history) lives in
 * Supabase under the `vp_*` schema. Those tables are read directly by tools.
 *
 * This file holds small shared helpers:
 * - trimHistory: drop oldest messages when history exceeds a budget,
 * keeping the system prompt and a sane overlap window so the LLM
 * still has continuity.
 * - generateId: short non-secure id for client-side message keys.
 */

import type { ChatMessage } from'./llm';

const DEFAULT_MAX_MESSAGES = 40; // ~20 turns
const DEFAULT_KEEP_RECENT = 20; // ~10 turns

export function trimHistory(
 history: ChatMessage[],
 opts: { max?: number; keepRecent?: number } = {},
): ChatMessage[] {
 const max = opts.max ?? DEFAULT_MAX_MESSAGES;
 const keep = opts.keepRecent ?? DEFAULT_KEEP_RECENT;

 if (history.length <= max) return history;

 // Skip non-message entries (system reminders aren't in ChatMessage[], but
 // defend in case future additions include them).
 const messages = history.filter((m) => m.role !=='system');

 // Keep first user message (gives LLM original context) + last `keep` msgs.
 if (messages.length <= keep) return messages;

 const head = messages[0];
 const tail = messages.slice(-keep);
 // Drop everything in between; LLM still has the original request + recent context.
 return [head, ...tail];
}

export function generateId(prefix ='msg'): string {
 return `${prefix}_${Date.now().toString(36)}_${Math.random()
 .toString(36)
 .slice(2, 8)}`;
}

/**
 * Estimate token count for a conversation.
 * Rough heuristic: ~4 chars per token. Used only to log / warn — actual
 * limiting is done by trimHistory.
 */
export function estimateTokens(messages: ChatMessage[]): number {
 let chars = 0;
 for (const m of messages) {
 if (typeof m.content ==='string') {
 chars += m.content.length;
 }
 if (m.content === null) chars += 4;
 if (Array.isArray(m.content)) {
 chars += JSON.stringify(m.content).length;
 }
 if (m.role ==='assistant'&&'tool_calls'in m && m.tool_calls) {
 chars += JSON.stringify(m.tool_calls).length;
 }
 }
 return Math.ceil(chars / 4);
}