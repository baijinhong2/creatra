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
  'empty.greeting': { zh: '你好 — 我是你的 X 运营合伙人。', en: "Hi — I'm your X ops partner." },
  'empty.body': {
    zh: '我专门做 X 账号运营,8 件事都能干:定位挖掘 · 用户名/bio · 对标博主 · 内容策略 · 每日推文 · 评论回复 · 竞品互动 · 数据分析。挑一个起点,或者直接说要啥。',
    en: 'I run X accounts end-to-end. 8 capabilities: positioning · username/bio · similar creators · content strategy · daily tweets · comment replies · competitor engagement · analytics. Pick a starter or just say what you need.',
  },
  'empty.skillsHint': {
    zh: '所有能力 →',
    en: 'All skills →',
  },

  // Suggested prompts — covers the most common entry points across the
  // 8-skill catalog. Order: process-natural for a new user.
  'prompt.positioning.title': { zh: '从 0 定位账号', en: 'Position my account' },
  'prompt.positioning.body': { zh: '我想搞个 X 账号,但不知道做啥方向。帮我挖一下。', en: 'I want to start an X account but have no idea what niche. Help me figure it out.' },
  'prompt.brand.title': { zh: '取名 + bio', en: 'Username + bio' },
  'prompt.brand.body': { zh: '我的定位是 X,帮我取个用户名 + 写个 bio + 想个头像方向。', en: 'My niche is X. Help me pick a handle, write a bio, and figure out an avatar direction.' },
  'prompt.creators.title': { zh: '找对标博主', en: 'Find creators to follow' },
  'prompt.creators.body': { zh: '基于我的定位,推荐 10 个我应该 follow 的对标(分大 V / 成长中 / 新兴三档)。', en: 'Based on my positioning, recommend 10 similar creators to follow (split into big / growing / emerging).' },
  'prompt.strategy.title': { zh: '内容更新策略', en: 'Content + update strategy' },
  'prompt.strategy.body': { zh: '结合对标和我的项目,给我 3 个内容 pillar + 更新频次/时段/形式的策略。', en: 'Combine my watchlist and my projects into a strategy: 3 content pillars + frequency + format mix.' },
  'prompt.daily.title': { zh: '今天发什么', en: "Today's tweets" },
  'prompt.daily.body': { zh: '今天发什么推文?给我 3 条直接可发的,带配图说明。', en: "Plan today's tweets. Give me 3 publishable ones with image guidance." },
  'prompt.analytics.title': { zh: '我的数据', en: 'My analytics' },
  'prompt.analytics.body': { zh: '看我最近 20 条推文表现,哪些火、哪些没火、下周该调整啥。', en: 'Look at my last 20 tweets — which worked, which didnt, what to change next week.' },

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
