/**
 * Agent core: ReAct loop with real LLM streaming.
 *
 * Yields SSE events that the API route forwards to the client.
 *
 * Loop:
 * 1. Send messages + tools to LLM (stream mode)
 * 2. As tokens arrive → emit `message_delta` events live
 * 3. If the LLM emits tool_calls → execute them, append tool results, loop
 * 4. If the LLM emits text only → emit `message_end` + `done`, return
 */

import type { ChatMessage, ContentPart, ToolCall } from'./llm';
import { chatStream } from'./llm';
import { TOOL_DEFINITIONS, runTool, type ToolName } from'./tools';
import { buildSystemPrompt, type ConvMode } from'./prompts';

export type AgentEvent =
 | { type:'message_start'}
 | { type:'message_delta'; content: string }
 | { type:'message_end'; content: string }
 | { type:'mode_decided'; mode:'expert'|'assistant'} // auto mode: agent's per-turn decision
 | {
 type:'tool_start';
 toolCallId: string;
 name: string;
 args: Record<string, unknown>;
 }
 | {
 type:'tool_end';
 toolCallId: string;
 name: string;
 ok: boolean;
 result: unknown;
 error?: string;
 }
 | { type:'error'; message: string; code?: string }
 | { type:'done'};

const MAX_ITERATIONS = 8;

/**
 * Auto-mode tag parser.
 *
 * In `auto` mode, the agent's system prompt tells it to emit
 * `<mode>expert</mode>` or `<mode>assistant</mode>` at the start of
 * its response. The UI shows the chosen mode as a badge.
 *
 * We strip the tag from what the user sees (so it doesn't appear in
 * the chat) and emit a `mode_decided` event so the front-end can
 * update its mode indicator.
 *
 * Strategy: buffer the first ~40 chars. If the tag is found, peel
 * it off (and any leading whitespace/newline) and yield a
 * `mode_decided` event before streaming the rest. If no tag appears
 * within the buffer window, flush everything as-is (the agent
 * didn't follow the convention — degrade gracefully).
 */
const AUTO_TAG_RE = /^\s*<mode>(expert|assistant)<\/mode>\s*/i;
const AUTO_TAG_BUFFER_LIMIT = 40; // generous, tag itself is ~25 chars

function tryStripAutoTag(
 soFar: string,
): { tag:'expert'|'assistant'| null; stripped: string; consumed: number } {
 const m = soFar.slice(0, AUTO_TAG_BUFFER_LIMIT).match(AUTO_TAG_RE);
 if (m) {
 return {
 tag: m[1].toLowerCase() as'expert'|'assistant',
 stripped: soFar.slice(m[0].length),
 consumed: m[0].length,
 };
 }
 return { tag: null, stripped: soFar, consumed: 0 };
}

type StreamChunk = {
 choices?: Array<{
 delta?: {
 content?: string | null;
 tool_calls?: Array<{
 index: number;
 id?: string;
 type?:'function';
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
 model: string,
): AsyncGenerator<AgentEvent, { content: string; toolCalls: ToolCall[] }> {
 const stream = (await chatStream({
 messages,
 tools: TOOL_DEFINITIONS,
 tool_choice:'auto',
 temperature: 0.7,
 max_tokens: 4000,
 model,
 })) as unknown as AsyncIterable<StreamChunk>;

 let accumulatedContent ='';
 // DeepSeek sends tool_calls incrementally across chunks:
 // chunk 1: { index: 0, id:'call_abc', function: { name:'web_search', arguments:''} }
 // chunk 2: { index: 0, function: { arguments:'{"q'} }
 // chunk 3: { index: 0, function: { arguments:'uery":'} }
 // ... so we accumulate per index.
 const tcByIndex = new Map<
 number,
 { id: string; name: string; args: string }
 >();
 let startedMessage = false;
 // Auto-mode tag detection state. `null` means the tag has been found
 // (or the response doesn't start with one); `number` is the length of
 // the leading buffer we're still examining.
 let autoTagBuffer: number | null = AUTO_TAG_BUFFER_LIMIT;
 let pendingDecided:'expert'|'assistant'| null = null;

 for await (const chunk of stream) {
 const delta = chunk.choices?.[0]?.delta;
 if (!delta) continue;

 if (typeof delta.content ==='string'&& delta.content.length > 0) {
 if (!startedMessage) {
 startedMessage = true;
 yield { type:'message_start'};
 }
 accumulatedContent += delta.content;

 // Auto-mode tag stripping. We buffer the first AUTO_TAG_BUFFER_LIMIT
 // chars of content; once a tag is identified, we emit
 // `mode_decided` and skip the tag chars in the streamed deltas.
 if (autoTagBuffer !== null) {
 const head = accumulatedContent.slice(0, AUTO_TAG_BUFFER_LIMIT);
 const m = head.match(AUTO_TAG_RE);
 if (m) {
 // Tag found. Emit mode_decided once and trim tag from accumulated.
 pendingDecided = m[1].toLowerCase() as'expert'|'assistant';
 yield { type:'mode_decided', mode: pendingDecided };
 const after = accumulatedContent.slice(m[0].length);
 // Stream everything *after* the tag (skip the tag itself).
 if (after.length > 0) {
 yield { type:'message_delta', content: after };
 }
 accumulatedContent = after;
 autoTagBuffer = null;
 } else if (head.length >= AUTO_TAG_BUFFER_LIMIT) {
 // Buffer full, no tag — flush whatever we have.
 yield { type:'message_delta', content: head };
 accumulatedContent = accumulatedContent.slice(AUTO_TAG_BUFFER_LIMIT);
 autoTagBuffer = null;
 } else if (!/^[\s<]/.test(head)) {
 // First non-whitespace, non-'<'char and it's not a tag opener —
 // give up early and flush.
 yield { type:'message_delta', content: head };
 accumulatedContent = accumulatedContent.slice(head.length);
 autoTagBuffer = null;
 }
 // else: still buffering, don't yield yet
 } else {
 yield { type:'message_delta', content: delta.content };
 }
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
 id: tc.id ??'',
 name: tc.function?.name ??'',
 args: tc.function?.arguments ??'',
 });
 }
 }
 }
 }

 // Flush any leftover buffer (e.g. model only produced 5 chars and stopped).
 if (autoTagBuffer !== null && accumulatedContent.length > 0) {
 yield { type:'message_delta', content: accumulatedContent };
 accumulatedContent ='';
 }

 const toolCalls: ToolCall[] = Array.from(tcByIndex.values()).map((tc) => ({
 id: tc.id,
 type:'function',
 function: { name: tc.name, arguments: tc.args },
 }));

 return { content: accumulatedContent, toolCalls };
}

export async function* runAgent(
 userMessage: string | ContentPart[],
 history: ChatMessage[] = [],
 userId: string,
 conversationId?: string,
 model: string ='deepseek-v4-flash',
 mode: ConvMode ='auto',
): AsyncGenerator<AgentEvent> {
 const messages: ChatMessage[] = [
 { role:'system', content: await buildSystemPrompt({ mode, userId }) },
 ...history,
 { role:'user', content: userMessage },
 ];

 for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
 let result: { content: string; toolCalls: ToolCall[] };
 try {
 const gen = streamOneTurn(messages, userId, conversationId, model);
 let next = await gen.next();
 while (!next.done) {
 yield next.value;
 next = await gen.next();
 }
 result = next.value;
 } catch (e) {
 yield {
 type:'error',
 message: e instanceof Error ? e.message : String(e),
 };
 return;
 }

 const { content, toolCalls } = result;

 if (toolCalls.length > 0) {
 if (content.length > 0) {
 yield { type:'message_end', content };
 }

 messages.push({
 role:'assistant',
 content,
 tool_calls: toolCalls,
 });

  for (const tc of toolCalls) {
  const args = safeParse(tc.function.arguments);

  yield {
  type:'tool_start',
  toolCallId: tc.id,
  name: tc.function.name,
  args,
  };

  const r = await runTool(tc.function.name as ToolName, args, {
  userId,
  conversationId,
  });

  yield {
  type:'tool_end',
  toolCallId: tc.id,
  name: tc.function.name,
  ok: r.ok,
  result: r.data,
  error: r.error,
  };

  messages.push({
  role:'tool',
  tool_call_id: tc.id,
  content: JSON.stringify({ ok: r.ok, data: r.data, error: r.error }),
  });
  }

  // ─── Loop guard: detect repeated identical tool errors ────────────────
  // If the last 2 tool messages have the same (ok: false, error) tuple, the
  // LLM is stuck retrying a broken tool. Force a final user-facing message
  // instead of letting the loop run to MAX_ITERATIONS and dumping a cryptic
  // "Agent loop hit max iterations" error.
  const toolMessages = messages.filter((m) => m.role ==='tool');

  // Helper: find the tool name for the Nth-from-last tool message
  // by walking messages backward to find the corresponding assistant turn.
  function findToolNameForToolMsg(idx: number): string | null {
  let toolMsgCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
  const m = messages[i] as { role: string; tool_calls?: Array<{ function: { name: string } }> };
  if (m.role ==='tool') {
  if (toolMsgCount === idx) {
  // found the Nth tool message; the tool name is in the immediately preceding
  // assistant message's tool_calls (for the corresponding call)
  for (let j = i - 1; j >= 0; j--) {
  const a = messages[j] as { role: string; tool_calls?: Array<{ function: { name: string } }> };
  if (a.role ==='assistant'&& a.tool_calls && a.tool_calls.length > 0) {
  return a.tool_calls[a.tool_calls.length - 1].function.name;
  }
  }
  return null;
  }
  toolMsgCount++;
  }
  }
  return null;
  }

  // Guard 1: same (ok:false, error) on last 2 tool calls → stuck on a broken tool
  if (toolMessages.length >= 2) {
  const last1 = safeParse((toolMessages[toolMessages.length - 1] as { content: string }).content);
  const last2 = safeParse((toolMessages[toolMessages.length - 2] as { content: string }).content);
  if (
  last1.ok === false && last2.ok === false &&
  typeof last1.error ==='string' &&
  last1.error === last2.error
  ) {
  const stuckError = last1.error as string;
  yield {
  type:'message_end',
  content:
  `我刚才连续 2 次都拿到同样的错误,看来这个工具现在不可用:\n\n` +
  `\`${stuckError}\`\n\n` +
  `这种情况一般是平台接口本身不可用(网络问题、anti-bot 拦截、或账号/凭据没配)。` +
  `**别瞎重试** — 直接告诉用户哪个工具不可用 + 错误原因,如果有必要建议他们稍后再试或换个工具。`,
  };
  yield { type:'done'};
  return;
  }
  }

  // Guard 2: same tool called 3+ times in last 3 calls → agent is in a retry loop
  if (toolMessages.length >= 3) {
  const name0 = findToolNameForToolMsg(toolMessages.length - 3);
  const name1 = findToolNameForToolMsg(toolMessages.length - 2);
  const name2 = findToolNameForToolMsg(toolMessages.length - 1);
  if (name0 && name1 && name2 && name0 === name1 && name1 === name2) {
  yield {
  type:'message_end',
  content:
  `我刚才连续 3 次调 \`${name0}\` 都没拿到新进展,可能工具正常但我没把它用对。\n\n` +
  `**别再调** — 直接基于已有数据给用户一个**部分**答案,或者**承认自己卡住了**,让用户给点提示(换个关键词 / 加点上下文 / 换个工具)。`,
  };
  yield { type:'done'};
  return;
  }
  }

  // Guard 3: last 2 tool results are string-identical → agent is going in circles
  if (toolMessages.length >= 2) {
  const last1Str = (toolMessages[toolMessages.length - 1] as { content: string }).content;
  const last2Str = (toolMessages[toolMessages.length - 2] as { content: string }).content;
  if (last1Str === last2Str) {
  yield {
  type:'message_end',
  content:
  `我刚才调了 2 次工具,拿到的结果一字不差 — 明显在空转。\n\n` +
  `直接基于已有数据给用户一个**部分**答案,或者**承认自己卡住了**,让用户决定下一步。`,
  };
  yield { type:'done'};
  return;
  }
  }

  continue;
  }

 if (content.length > 0) {
 yield { type:'message_end', content };
 }
 yield { type:'done'};
 return;
 }

 yield {
 type:'error',
 message: `Agent loop hit max iterations (${MAX_ITERATIONS}).`,
 };
}

function safeParse(s: string): Record<string, unknown> {
 try {
 const parsed = JSON.parse(s);
 return typeof parsed ==='object'&& parsed !== null
 ? (parsed as Record<string, unknown>)
 : {};
 } catch {
 return {};
 }
}
