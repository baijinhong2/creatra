import OpenAI from 'openai';

/**
 * DeepSeek via OpenAI-compatible API.
 * Supports tool calling (function calling) for agent ReAct loops.
 *
 * Probed 2026-07-11: deepseek-v4-pro and deepseek-v4-flash are the two
 * currently supported model names. deepseek-chat / deepseek-reasoner /
 * deepseek-coder are aliases that still resolve but DeepSeek recommends
 * the v4-* names going forward. deepseek-v3 is rejected.
 */

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.warn('[llm] DEEPSEEK_API_KEY not set; agent will not work.');
}

export const deepseek = new OpenAI({
  apiKey: apiKey ?? 'placeholder-key-for-build',
  baseURL: 'https://api.deepseek.com',
});

/** Available models the user can pick in the UI. */
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

export function getModel(id: string | undefined): ModelId {
  return id === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : DEFAULT_MODEL;
}

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

/**
 * Transform our slim ToolDefinition[] into OpenAI's ChatCompletionTool[] shape
 * (the wire format DeepSeek expects):
 *
 *   { type: 'function', function: { name, description, parameters } }
 *
 * Without `type: 'function'` at the top level, DeepSeek rejects the request
 * with `tools[0]: missing field 'type'`.
 */
function wrapTools(tools?: ToolDefinition[]) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function chat(
  req: Omit<ChatCompletionRequest, 'model'> & { model?: string },
) {
  const { model: _ignored, ...rest } = req;
  const body = {
    model: _ignored ?? DEFAULT_MODEL,
    ...rest,
    tools: wrapTools(req.tools),
  };
  return deepseek.chat.completions.create(body as any) as any;
}

export async function* chatStream(
  req: Omit<ChatCompletionRequest, 'model' | 'stream'> & { model?: string },
) {
  const { model: _ignored, ...rest } = req;
  const body = {
    model: _ignored ?? DEFAULT_MODEL,
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