import OpenAI from 'openai';

/**
 * DeepSeek V4-flash via OpenAI-compatible API.
 * Supports tool calling (function calling) for agent ReAct loops.
 */

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.warn('[llm] DEEPSEEK_API_KEY not set; agent will not work.');
}

export const deepseek = new OpenAI({
  apiKey: apiKey ?? 'placeholder-key-for-build',
  baseURL: 'https://api.deepseek.com',
});

export const MODEL = 'deepseek-v4-flash';

// ─── Tool / function calling types ────────────────────────────────────────

export type ToolParameterSchema = {
  type: 'object';
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

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
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
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

// ─── Convenience wrappers ────────────────────────────────────────────────

export async function chat(req: Omit<ChatCompletionRequest, 'model'>) {
  // DeepSeek's API is OpenAI-compatible but our ToolDefinition is a slimmed
  // subset. Cast the whole call to `any` to skip OpenAI SDK's stricter
  // discriminator on `stream` (true / false / null) and ChatCompletionTool
  // shape — runtime behavior matches.
  return deepseek.chat.completions.create({
    model: MODEL,
    ...req,
  } as any) as any;
}

export async function* chatStream(
  req: Omit<ChatCompletionRequest, 'model' | 'stream'>,
) {
  const stream = (await deepseek.chat.completions.create({
    model: MODEL,
    ...req,
    stream: true,
  } as any)) as unknown as AsyncIterable<{
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
    }>;
  }>;
  for await (const chunk of stream) {
    yield chunk;
  }
}