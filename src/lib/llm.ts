import OpenAI from'openai';

/**
 * DeepSeek via OpenAI-compatible API.
 * Supports tool calling (function calling) for agent ReAct loops.
 *
 * Probed 2026-07-11: deepseek-v4-pro and deepseek-v4-flash are the two
 * currently supported model names. deepseek-chat / deepseek-reasoner /
 * deepseek-coder are aliases that still resolve but DeepSeek recommends
 * the v4-* names going forward. deepseek-v3 is rejected.
 *
 * IMPORTANT: this module is SERVER ONLY. Importing it from a client
 * component will pull the OpenAI client into the browser bundle, and
 * the SDK throws"running in a browser-like environment"on construct.
 * Use `src/lib/models.ts` for client-safe constants.
 */

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
 console.warn('[llm] DEEPSEEK_API_KEY not set; agent will not work.');
}

export const deepseek = new OpenAI({
 apiKey: apiKey ??'placeholder-key-for-build',
 baseURL:'https://api.deepseek.com',
});

// Re-export client-safe model constants for server-side callers
// (e.g. /api/chat) so we don't have to import from `models.ts` everywhere.
import { DEFAULT_MODEL as _DEFAULT_MODEL } from'./models';
export { MODELS, DEFAULT_MODEL, getModel } from'./models';
export type { ModelId } from'./models';

// ─── Tool / function calling types ────────────────────────────────────────

export type ToolParameterSchema = {
 type:'object';
 properties: Record<string, {
 type: string;
 description: string;
 enum?: string[];
 }>;
 required?: string[];
};

export type ToolDefinition = {
 name: string;
 description: string;
 parameters: ToolParameterSchema;
};

export type ChatMessageRole ='system'|'user'|'assistant'|'tool';

/**
 * Multi-modal content parts. `image_url` follows the OpenAI / DeepSeek
 * vision format — `url` can be a public http(s) URL OR a data URI
 * (`data:image/png;base64,...`). DeepSeek's V3/V4 may not support this
 * yet; if it errors, the chat route falls back to text-only.
 */
export type ContentPart =
 | { type:'text'; text: string }
 | { type:'image_url'; image_url: { url: string } };

export type ChatMessage =
 | { role:'system'; content: string }
 | { role:'user'; content: string | ContentPart[] }
 | { role:'assistant'; content?: string; tool_calls?: ToolCall[] }
 | { role:'tool'; tool_call_id: string; content: string };

export type ToolCall = {
 id: string;
 type:'function';
 function: { name: string; arguments: string };
};

export type ChatCompletionRequest = {
 model: string;
 messages: ChatMessage[];
 tools?: ToolDefinition[];
 tool_choice?:'auto'|'none'| { type:'function'; function: { name: string } };
 temperature?: number;
 max_tokens?: number;
 stream?: boolean;
};

export type ChatCompletionResponse = {
 id: string;
 model: string;
 choices: Array<{
 index: number;
 message: {
 role:'assistant';
 content: string | null;
 tool_calls?: ToolCall[];
 };
 finish_reason:'stop'|'tool_calls'|'length'|'content_filter';
 }>;
 usage?: {
 prompt_tokens: number;
 completion_tokens: number;
 total_tokens: number;
 };
};

// ─── Convenience wrappers ────────────────────────────────────────────────

/**
 * Transform our slim ToolDefinition[] into OpenAI's ChatCompletionTool[] shape
 * (the wire format DeepSeek expects):
 *
 * { type:'function', function: { name, description, parameters } }
 *
 * Without `type:'function'` at the top level, DeepSeek rejects the request
 * with `tools[0]: missing field'type'`.
 */
function wrapTools(tools?: ToolDefinition[]) {
 if (!tools) return undefined;
 return tools.map((t) => ({
 type:'function'as const,
 function: {
 name: t.name,
 description: t.description,
 parameters: t.parameters,
 },
 }));
}

export async function chat(
 req: Omit<ChatCompletionRequest,'model'> & { model?: string },
) {
 const { model: _ignored, ...rest } = req;
 const body = {
 model: _ignored ?? _DEFAULT_MODEL,
 ...rest,
 tools: wrapTools(req.tools),
 };
 return deepseek.chat.completions.create(body as any) as any;
}

export async function* chatStream(
 req: Omit<ChatCompletionRequest,'model'|'stream'> & { model?: string },
) {
 const { model: _ignored, ...rest } = req;
 const body = {
 model: _ignored ?? _DEFAULT_MODEL,
 ...rest,
 tools: wrapTools(req.tools),
 stream: true,
 };
 const stream = (await deepseek.chat.completions.create(
 body as any,
 )) as unknown as AsyncIterable<{
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
 }>;
 }>;
 for await (const chunk of stream) {
 yield chunk;
 }
}