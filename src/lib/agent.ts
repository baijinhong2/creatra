/**
 * Agent core: ReAct loop with tool calling.
 *
 * Yields streaming events that the API route forwards to the client as SSE.
 *
 * Loop:
 *   1. Send messages + tools to LLM
 *   2. If LLM returns tool_calls → execute them, append tool results, loop
 *   3. If LLM returns final text → yield it, return
 */

import type { ChatMessage, ToolCall } from './llm';
import { chat } from './llm';
import { TOOL_DEFINITIONS, runTool, type ToolName } from './tools';
import { AGENT_SYSTEM_PROMPT } from './prompts';

export type AgentEvent =
  | { type: 'message_start' }
  | { type: 'message_delta'; content: string }
  | { type: 'message_end'; content: string }
  | {
      type: 'tool_start';
      toolCallId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: 'tool_end';
      toolCallId: string;
      name: string;
      ok: boolean;
      result: unknown;
      error?: string;
    }
  | { type: 'error'; message: string }
  | { type: 'done' };

const MAX_ITERATIONS = 8;

export async function* runAgent(
  userMessage: string,
  history: ChatMessage[] = [],
): AsyncGenerator<AgentEvent> {
  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userMessage },
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let response;
    try {
      response = (await chat({
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 4000,
      })) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: ToolCall[];
          };
          finish_reason: string;
        }>;
      };
    } catch (e) {
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }

    const choice = response.choices[0];
    if (!choice) {
      yield { type: 'error', message: 'No response from LLM' };
      return;
    }

    const { content, tool_calls: toolCalls } = choice.message;

    // ── Path 1: tool calls ────────────────────────────────────────────
    if (toolCalls && toolCalls.length > 0) {
      // Append assistant message (with tool_calls) to history first
      messages.push({
        role: 'assistant',
        content: content ?? '',
        tool_calls: toolCalls,
      });

      // Execute each tool sequentially, yield events, append tool results
      for (const tc of toolCalls) {
        const args = safeParse(tc.function.arguments);

        yield {
          type: 'tool_start',
          toolCallId: tc.id,
          name: tc.function.name,
          args,
        };

        const result = await runTool(tc.function.name as ToolName, args);

        yield {
          type: 'tool_end',
          toolCallId: tc.id,
          name: tc.function.name,
          ok: result.ok,
          result: result.data,
          error: result.error,
        };

        // Append tool result for the next LLM turn
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({
            ok: result.ok,
            data: result.data,
            error: result.error,
          }),
        });
      }

      // Loop back: ask LLM with tool results included
      continue;
    }

    // ── Path 2: final text response ───────────────────────────────────
    const text = content ?? '';

    yield { type: 'message_start' };
    // Chunk the text into a few pieces so the UI feels like streaming
    const chunks = chunkText(text, 40);
    for (const c of chunks) {
      yield { type: 'message_delta', content: c };
    }
    yield { type: 'message_end', content: text };
    yield { type: 'done' };
    return;
  }

  yield {
    type: 'error',
    message: `Agent loop hit max iterations (${MAX_ITERATIONS}).`,
  };
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function chunkText(text: string, size: number): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out;
}