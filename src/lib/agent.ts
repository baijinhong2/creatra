/**
 * Agent core: ReAct loop with real LLM streaming.
 *
 * Yields SSE events that the API route forwards to the client.
 *
 * Loop:
 *   1. Send messages + tools to LLM (stream mode)
 *   2. As tokens arrive → emit `message_delta` events live
 *   3. If the LLM emits tool_calls → execute them, append tool results, loop
 *   4. If the LLM emits text only → emit `message_end` + `done`, return
 */

import type { ChatMessage, ToolCall } from './llm';
import { chatStream } from './llm';
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

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
};

/**
 * Stream one LLM turn. Yields the assistant's `content` tokens as
 * `message_delta` events as they arrive. Tool calls are accumulated
 * across chunks and returned via the out-param at the end of the stream.
 *
 * Returns: { content, toolCalls, finishReason }
 */
async function* streamOneTurn(
  messages: ChatMessage[],
  userId: string,
  conversationId: string | undefined,
): AsyncGenerator<AgentEvent, { content: string; toolCalls: ToolCall[] }> {
  const stream = (await chatStream({
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 4000,
  })) as unknown as AsyncIterable<StreamChunk>;

  let accumulatedContent = '';
  // DeepSeek sends tool_calls incrementally across chunks:
  // chunk 1: { index: 0, id: 'call_abc', function: { name: 'web_search', arguments: '' } }
  // chunk 2: { index: 0, function: { arguments: '{"q' } }
  // chunk 3: { index: 0, function: { arguments: 'uery":' } }
  // ... so we accumulate per index.
  const tcByIndex = new Map<
    number,
    { id: string; name: string; args: string }
  >();
  let startedMessage = false;

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      if (!startedMessage) {
        startedMessage = true;
        yield { type: 'message_start' };
      }
      accumulatedContent += delta.content;
      yield { type: 'message_delta', content: delta.content };
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        const existing = tcByIndex.get(idx);
        if (existing) {
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
        } else {
          tcByIndex.set(idx, {
            id: tc.id ?? '',
            name: tc.function?.name ?? '',
            args: tc.function?.arguments ?? '',
          });
        }
      }
    }
  }

  const toolCalls: ToolCall[] = Array.from(tcByIndex.values()).map((tc) => ({
    id: tc.id,
    type: 'function',
    function: { name: tc.name, arguments: tc.args },
  }));

  return { content: accumulatedContent, toolCalls };
}

export async function* runAgent(
  userMessage: string,
  history: ChatMessage[] = [],
  userId: string,
  conversationId?: string,
): AsyncGenerator<AgentEvent> {
  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userMessage },
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let result: { content: string; toolCalls: ToolCall[] };
    try {
      const gen = streamOneTurn(messages, userId, conversationId);
      let next = await gen.next();
      while (!next.done) {
        yield next.value;
        next = await gen.next();
      }
      result = next.value;
    } catch (e) {
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }

    const { content, toolCalls } = result;

    if (toolCalls.length > 0) {
      if (content.length > 0) {
        yield { type: 'message_end', content };
      }

      messages.push({
        role: 'assistant',
        content,
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        const args = safeParse(tc.function.arguments);

        yield {
          type: 'tool_start',
          toolCallId: tc.id,
          name: tc.function.name,
          args,
        };

        const r = await runTool(tc.function.name as ToolName, args, {
          userId,
          conversationId,
        });

        yield {
          type: 'tool_end',
          toolCallId: tc.id,
          name: tc.function.name,
          ok: r.ok,
          result: r.data,
          error: r.error,
        };

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: r.ok, data: r.data, error: r.error }),
        });
      }

      continue;
    }

    if (content.length > 0) {
      yield { type: 'message_end', content };
    }
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
