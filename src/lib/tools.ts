/**
 * Tools available to the viralpost agent.
 * Each tool is described in the format DeepSeek's function-calling expects.
 * Implementation lives in the same file to keep things compact in MVP.
 */

import type { ToolDefinition } from './llm';
import { deepseek } from './llm';

// ─── Tool implementations ────────────────────────────────────────────────

type ToolContext = {
  userId?: string;
  conversationId?: string;
};

type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

async function tavilySearch(query: string, maxResults = 5): Promise<ToolResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'TAVILY_API_KEY not set' };
  }
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: true,
        search_depth: 'basic',
      }),
    });
    if (!r.ok) {
      return { ok: false, error: `Tavily HTTP ${r.status}` };
    }
    const data = (await r.json()) as {
      results?: Array<{ title: string; url: string; content: string }>;
      answer?: string;
    };
    return {
      ok: true,
      data: {
        answer: data.answer,
        results: (data.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.slice(0, 300),
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function githubRead(
  owner: string,
  repo: string,
  path = 'README.md',
): Promise<ToolResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'viralpost-agent',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers },
    );
    if (!r.ok) {
      return { ok: false, error: `GitHub API HTTP ${r.status}` };
    }
    const data = (await r.json()) as { content?: string; encoding?: string; name?: string };
    if (data.encoding === 'base64' && data.content) {
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      return {
        ok: true,
        data: {
          repo: `${owner}/${repo}`,
          path: data.name ?? path,
          content: decoded.slice(0, 4000),
          truncated: decoded.length > 4000,
          totalLength: decoded.length,
        },
      };
    }
    return { ok: false, error: 'Unexpected response shape' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function localProjectRead(path: string): Promise<ToolResult> {
  // MVP: only supports file paths under user's home / common project roots.
  // Sandbox this in production. For now, read from /Users/<user>/projects/*
  // or accept absolute paths the user has explicitly registered.
  const allowedRoots = [
    '/Users/',
    '/home/',
    process.cwd(),
  ];
  if (!allowedRoots.some((root) => path.startsWith(root))) {
    return { ok: false, error: `Path not in allowed roots: ${path}` };
  }
  try {
    const fs = await import('node:fs/promises');
    const stat = await fs.stat(path);
    if (!stat.isFile()) {
      return { ok: false, error: 'Not a file' };
    }
    if (stat.size > 100_000) {
      return { ok: false, error: `File too large (${stat.size} bytes, max 100k)` };
    }
    const content = await fs.readFile(path, 'utf-8');
    return {
      ok: true,
      data: {
        path,
        size: stat.size,
        content: content.slice(0, 4000),
        truncated: content.length > 4000,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function twitterApi(
  endpoint: 'search' | 'user-tweets',
  params: Record<string, string>,
): Promise<ToolResult> {
  const authToken = process.env.X_AUTH_TOKEN;
  const ct0 = process.env.X_CT0;
  if (!authToken || !ct0) {
    return {
      ok: false,
      error: 'X cookies not set; running in guest mode is not yet supported for search/timeline.',
    };
  }

  // Step 1: activate guest token (or use cookie auth directly)
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    Authorization:
      'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    Cookie: `auth_token=${authToken}; ct0=${ct0}`,
    'X-Csrf-Token': ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'Content-Type': 'application/json',
  };

  try {
    let data: unknown;
    if (endpoint === 'user-tweets') {
      const username = params.username;
      if (!username) return { ok: false, error: 'username required' };
      // UserByScreenName → UserTweets (same approach as drawspark's x-content-agent)
      const userIdRes = await fetch(
        `https://api.twitter.com/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${encodeURIComponent(
          JSON.stringify({ screen_name: username, withSafetyModeUserFields: true }),
        )}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      const userIdJson = (await userIdRes.json()) as {
        data?: { user?: { result?: { rest_id?: string } } };
      };
      const userId = userIdJson.data?.user?.result?.rest_id;
      if (!userId) return { ok: false, error: 'User not found' };

      const tweetsRes = await fetch(
        `https://api.twitter.com/graphql/E3opETHurmVJflFsUBVuQ/UserTweets?variables=${encodeURIComponent(
          JSON.stringify({
            userId,
            count: Number(params.count ?? 10),
            includePromotedContent: false,
            withQuickPromoteEligibilityTweetFields: true,
            withVoice: true,
            withV2Timeline: true,
          }),
        )}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      data = await tweetsRes.json();
    } else {
      // Search via the GraphQL SearchTimeline endpoint
      const query = params.query;
      if (!query) return { ok: false, error: 'query required' };
      const searchRes = await fetch(
        `https://api.twitter.com/graphql/gkjsKepM6gl_HmFWoWKfgg/SearchTimeline?variables=${encodeURIComponent(
          JSON.stringify({
            rawQuery: query,
            count: Number(params.count ?? 20),
            querySource: 'typed_query',
            product: 'Latest',
          }),
        )}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      data = await searchRes.json();
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function suggestSimilarCreators(
  accountContext: string,
  language: 'zh' | 'en' = 'zh',
): Promise<ToolResult> {
  // Use DeepSeek itself to suggest creators — needs at least API key
  if (!process.env.DEEPSEEK_API_KEY) {
    return { ok: false, error: 'DEEPSEEK_API_KEY not set' };
  }
  const prompt =
    language === 'zh'
      ? `基于以下账号定位,推荐 10 个相似/对标 X(Twitter)账号。

账号定位:${accountContext}

要求:
- 优先推荐真人创作者,不要官方品牌账号
- 推荐不同量级的账号(几个大 V + 几个成长中的)
- 给出每个账号的 @handle、一句话简介、为什么值得对标
- 直接输出 JSON 数组,不要 markdown

格式:
[{"handle":"@xxx","bio":"一句话简介","why":"为什么对标","followerRange":"1k-10k|10k-100k|100k+"}]`
      : `Recommend 10 similar/benchmark X (Twitter) accounts based on the following account positioning.

Positioning: ${accountContext}

Requirements:
- Prioritize real creators, not official brand accounts
- Mix follower sizes (a few big accounts + several growing ones)
- For each: @handle, one-line bio, why they're a good benchmark, follower range
- Output raw JSON array, no markdown

Format:
[{"handle":"@xxx","bio":"one-line bio","why":"why benchmark","followerRange":"1k-10k|10k-100k|100k+"}]`;

  try {
    const r = await deepseek.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant that recommends X (Twitter) accounts. Output strictly valid JSON only — no markdown fences, no explanations.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500,
    });
    const content = r.choices[0]?.message?.content;
    if (!content) return { ok: false, error: 'Empty LLM response' };
    try {
      const parsed = JSON.parse(content);
      // Some models wrap in { suggestions: [...] }; unwrap if so.
      const list = Array.isArray(parsed) ? parsed : (parsed.suggestions ?? parsed.creators ?? []);
      return { ok: true, data: list };
    } catch {
      return { ok: false, error: 'Invalid JSON from LLM' };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Tool registry (definitions + dispatch) ───────────────────────────────

export type ToolName =
  | 'web_search'
  | 'github_read'
  | 'local_project_read'
  | 'twitter_search'
  | 'twitter_get_user_tweets'
  | 'suggest_similar_creators';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'web_search',
    description:
      'Search the web for recent news, trends, and articles. Use when you need to know what is happening in the user\'s niche right now.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'string', description: 'Optional, default 5' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_read',
    description:
      'Read a file from a public GitHub repository. Use to learn what the user is building so their content can naturally reference it (build-in-public strategy).',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub user or org' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path, default README.md' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'local_project_read',
    description:
      'Read a file from the user\'s local machine. Use for build-in-public context: read README, CHANGELOG, or recent commits.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'twitter_search',
    description:
      'Search recent tweets on X by keyword. Use to find trending discussions and angle ideas.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'string', description: 'Optional, default 20' },
      },
      required: ['query'],
    },
  },
  {
    name: 'twitter_get_user_tweets',
    description:
      'Fetch the most recent tweets of a given X user. Use to study a benchmark account\'s recent content.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'X handle without @' },
        count: { type: 'string', description: 'Optional, default 10' },
      },
      required: ['username'],
    },
  },
  {
    name: 'suggest_similar_creators',
    description:
      'Given the user\'s account positioning, recommend 10 similar / benchmark X creators. Use when the user is unsure who to track.',
    parameters: {
      type: 'object',
      properties: {
        account_context: {
          type: 'string',
          description: 'The user\'s account positioning / niche',
        },
        language: { type: 'string', description: '"zh" or "en", default "zh"' },
      },
      required: ['account_context'],
    },
  },
];

export async function runTool(
  name: ToolName,
  args: Record<string, unknown>,
  _ctx: ToolContext = {},
): Promise<ToolResult> {
  switch (name) {
    case 'web_search':
      return tavilySearch(String(args.query ?? ''), Number(args.max_results ?? 5));
    case 'github_read':
      return githubRead(String(args.owner), String(args.repo), String(args.path ?? 'README.md'));
    case 'local_project_read':
      return localProjectRead(String(args.path));
    case 'twitter_search':
      return twitterApi('search', {
        query: String(args.query ?? ''),
        count: String(args.count ?? 20),
      });
    case 'twitter_get_user_tweets':
      return twitterApi('user-tweets', {
        username: String(args.username ?? ''),
        count: String(args.count ?? 10),
      });
    case 'suggest_similar_creators':
      return suggestSimilarCreators(
        String(args.account_context ?? ''),
        (args.language as 'zh' | 'en') ?? 'zh',
      );
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}