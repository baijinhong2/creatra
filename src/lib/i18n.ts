/**
 * Tiny i18n for viralpost. ZH is the default.
 *
 * Usage:
 *   const lang = 'zh' | 'en';
 *   const text = t(lang, 'sidebar.newChat');
 *
 * Keep keys flat and ASCII for easy grep. Add new strings here, not inline
 * in components. If a key is missing, returns the EN fallback (so reviewers
 * see English missing keys clearly) wrapped in `!` markers.
 */

export type Lang = 'zh' | 'en';

export const DEFAULT_LANG: Lang = 'zh';
export const LANG_STORAGE_KEY = 'vp_lang';

const dict = {
  // ── App identity ──────────────────────────────────────────
  'app.name': { zh: 'viralpost', en: 'viralpost' },
  'app.tagline': { zh: 'X 增长 agent', en: 'X growth agent' },
  'app.version': { zh: '本地版 v0.2', en: 'Local build v0.2' },

  // ── Sidebar ──────────────────────────────────────────────
  'sidebar.newChat': { zh: '新对话', en: 'New chat' },
  'sidebar.recent': { zh: '最近对话', en: 'Recent' },
  'sidebar.refresh': { zh: '刷新', en: 'Refresh' },
  'sidebar.emptyChats': { zh: '还没有对话 — 点上面开一个', en: 'No chats yet — start one ↑' },
  'sidebar.sources': { zh: '数据源', en: 'Sources' },
  'sidebar.lang.label': { zh: '界面语言', en: 'Interface language' },
  'sidebar.lang.zh': { zh: '中文', en: 'Chinese' },
  'sidebar.lang.en': { zh: '英文', en: 'English' },

  // ── Top bar ──────────────────────────────────────────────
  'topbar.chat': { zh: '对话中', en: 'Chat' },
  'topbar.newChat': { zh: '新对话', en: 'New chat' },

  // ── Empty state ──────────────────────────────────────────
  'empty.greeting': { zh: '你好 — 我是你的 X 增长 agent。', en: "Hi — I'm your X growth agent." },
  'empty.body': {
    zh: '我能搜 X 和全网、看你的 GitHub、追踪对标博主、陪你一起写推文。挑一个起点,或者直接告诉我你要什么。',
    en: 'I can search X and the web, look at your GitHub, watch creators you admire, and write tweets with you. Pick a starter, or just say what you need.',
  },

  // Suggested prompts (titles + bodies)
  'prompt.audit.title': { zh: '诊断账号', en: 'Audit my account' },
  'prompt.audit.body': { zh: '我这个 X 账号现在啥状态?最该先抓什么?', en: "What's the current state of my X account? Where should I focus first?" },
  'prompt.findCreators.title': { zh: '找对标博主', en: 'Find creators to follow' },
  'prompt.findCreators.body': { zh: '帮我找 5 个现在值得关注的独立开发者/AI 创业者。', en: 'Find me 5 indie developers or AI builders on X I should follow right now.' },
  'prompt.buildInPublic.title': { zh: 'build in public 草稿', en: 'Build-in-public draft' },
  'prompt.buildInPublic.body': { zh: '看看我的 GitHub 仓库,给我写一条今天能发的 build-in-public 推文。', en: 'Look at my GitHub repos and suggest a build-in-public tweet for today.' },
  'prompt.trends.title': { zh: '热点 + 角度', en: 'Trends + angles' },
  'prompt.trends.body': { zh: '搜下 X 和全网最近 AI / indie hacker 圈在聊啥,给我 3 个今天能发的角度。', en: 'Search X and the web for trending AI/indie-hacker topics today and give me 3 angles I could tweet.' },

  // ── Composer ─────────────────────────────────────────────
  'composer.placeholder': { zh: '说点啥。Enter 发送,Shift+Enter 换行。', en: 'Ask anything. Enter to send.' },
  'composer.placeholderStreaming': { zh: 'agent 跑着呢…', en: 'Agent is running…' },
  'composer.send': { zh: '发送', en: 'Send' },
  'composer.stop': { zh: '停止', en: 'Stop' },
  'composer.footer': {
    zh: 'viralpost 是一个真正的 agent —— 它会自己调工具,调用过程在上面流里能看到。',
    en: 'viralpost is an autonomous agent — it can call tools. Inspect tool calls in the stream.',
  },

  // ── Conversation meta ───────────────────────────────────
  'meta.msg': { zh: '条', en: 'msgs' },
  'meta.justNow': { zh: '刚刚', en: 'just now' },

  // ── Sources panel ────────────────────────────────────────
  'source.github.label': { zh: 'GitHub token', en: 'GitHub token' },
  'source.github.hint': { zh: '给 github_read 用。可选 —— 不填 60 次/小时,填了 5000/小时。', en: 'Used by github_read. Optional — without it you get 60 req/hour.' },
  'source.tavily.label': { zh: 'Tavily API key', en: 'Tavily API key' },
  'source.tavily.hint': { zh: '给 web_search 用。在 tavily.com 申请。', en: 'Used by web_search. Get one at tavily.com.' },
  'source.xAuth.label': { zh: 'X (Twitter) auth_token', en: 'X (Twitter) auth_token' },
  'source.xAuth.hint': { zh: '给 twitter_* 用。从浏览器 devtools 拿。', en: 'Used by twitter_search / twitter_get_user_tweets. From browser devtools.' },
  'source.xCt0.label': { zh: 'X (Twitter) ct0', en: 'X (Twitter) ct0' },
  'source.xCt0.hint': { zh: 'X 的 CSRF token,跟 auth_token 配对。', en: 'X CSRF token. Pairs with auth_token.' },

  'source.status.set': { zh: '● 已配', en: '● set' },
  'source.status.unset': { zh: '○ 未配', en: '○ not set' },
  'source.btn.add': { zh: '添加', en: 'Add' },
  'source.btn.replace': { zh: '替换', en: 'Replace' },
  'source.btn.forget': { zh: '删除', en: 'Forget' },
  'source.btn.save': { zh: '保存', en: 'Save' },
  'source.btn.cancel': { zh: '取消', en: 'Cancel' },
  'source.confirmForget': { zh: '确定删除 {key}?', en: 'Forget {key}?' },
  'source.statusMsg.loading': { zh: '加载中…', en: 'loading…' },
  'source.statusMsg.saved': { zh: '已存 {key}', en: 'saved {key}' },
  'source.statusMsg.forgot': { zh: '已删 {key}', en: 'forgot {key}' },
  'source.statusMsg.error': { zh: '出错了:{err}', en: 'error: {err}' },
  'source.empty': { zh: '(空:{key})', en: '(empty: {key})' },

  // ── Chat bubbles ─────────────────────────────────────────
  'bubble.errorPrefix': { zh: '出错了', en: 'Error' },

  // ── Tool card status ─────────────────────────────────────
  'tool.status.running': { zh: '跑中', en: 'running' },
  'tool.status.done': { zh: '完成', en: 'done' },
  'tool.status.error': { zh: '失败', en: 'error' },
  'tool.label.args': { zh: '参数', en: 'args' },
  'tool.label.result': { zh: '结果', en: 'result' },
  'tool.label.error': { zh: '错误', en: 'error' },
} as const;

export type DictKey = keyof typeof dict;

/** Substitute {key} placeholders from a params object. */
function substitute(s: string, params?: Record<string, string | number>) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

export function t(
  lang: Lang,
  key: DictKey,
  params?: Record<string, string | number>,
): string {
  const row = dict[key];
  if (!row) return `!missing:${key}`;
  const raw = row[lang] ?? row.en;
  return substitute(raw, params);
}

export function detectBrowserLang(): Lang {
  if (typeof navigator === 'undefined') return DEFAULT_LANG;
  const l = (navigator.language || '').toLowerCase();
  return l.startsWith('zh') ? 'zh' : 'en';
}
