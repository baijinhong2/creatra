'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  t,
  DEFAULT_LANG,
  DEFAULT_THEME,
  LANG_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type Lang,
  type Theme,
  type DictKey,
} from '@/lib/i18n';

// ─── Types ─────────────────────────────────────────────────────────────

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ToolCallDisplay = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  ok?: boolean;
  error?: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  endedAt?: number;
};

type AgentEvent =
  | { type: 'conversation_assigned'; conversationId: string }
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

const CONV_KEY = 'vp_conversation_id';

const SUGGESTED_PROMPT_KEYS: { title: DictKey; body: DictKey }[] = [
  { title: 'prompt.positioning.title', body: 'prompt.positioning.body' },
  { title: 'prompt.brand.title', body: 'prompt.brand.body' },
  { title: 'prompt.creators.title', body: 'prompt.creators.body' },
  { title: 'prompt.strategy.title', body: 'prompt.strategy.body' },
  { title: 'prompt.daily.title', body: 'prompt.daily.body' },
  { title: 'prompt.analytics.title', body: 'prompt.analytics.body' },
];

// ─────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────

type ConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

type Preference = {
  key: string;
  value: unknown;
  is_secret: boolean;
  has_value: boolean;
  updated_at: string;
};

type Source = {
  prefKey: string;
  label: DictKey;
  placeholder: string;
  hint: DictKey;
};

const SOURCES: Source[] = [
  {
    prefKey: 'github.token',
    label: 'source.github.label',
    placeholder: 'ghp_xxx or gho_xxx',
    hint: 'source.github.hint',
  },
  {
    prefKey: 'tavily.key',
    label: 'source.tavily.label',
    placeholder: 'tvly-xxx',
    hint: 'source.tavily.hint',
  },
  {
    prefKey: 'x.auth_token',
    label: 'source.xAuth.label',
    placeholder: 'auth_token cookie value',
    hint: 'source.xAuth.hint',
  },
  {
    prefKey: 'x.ct0',
    label: 'source.xCt0.label',
    placeholder: 'ct0 cookie value',
    hint: 'source.xCt0.hint',
  },
];

function timeAgo(iso: string, lang: Lang): string {
  const t1 = new Date(iso).getTime();
  const diff = Date.now() - t1;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t(lang, 'meta.justNow');
  if (min < 60) return lang === 'zh' ? `${min} 分钟前` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === 'zh' ? `${hr} 小时前` : `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return lang === 'zh' ? `${d} 天前` : `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─────────────────────────────────────────────────────────────────────
// Sidebar component
// ─────────────────────────────────────────────────────────────────────

function Sidebar({
  lang,
  setLang,
  theme,
  setTheme,
  conversations,
  activeId,
  onSelect,
  onNew,
  onRefresh,
  onClose,
  currentUser,
  onLogout,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRefresh: () => void;
  onClose: () => void;
  currentUser: { id: string; email: string; display_name: string | null } | null;
  onLogout: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const r = await fetch('/api/preferences', { cache: 'no-store' });
      if (r.ok) {
        const data = (await r.json()) as { preferences: Preference[] };
        setPrefs(data.preferences ?? []);
      }
    } catch {
      // ignore
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sourcesOpen) loadPrefs();
  }, [sourcesOpen, loadPrefs]);

  const savePref = async (key: string, value: string) => {
    setSavingKey(key);
    setStatusMsg(null);
    try {
      const r = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (r.ok) {
        setStatusMsg(t(lang, 'source.statusMsg.saved', { key }));
        setEditingKey(null);
        setEditingValue('');
        await loadPrefs();
      } else {
        const err = (await r.json()) as { error?: string };
        setStatusMsg(
          t(lang, 'source.statusMsg.error', { err: err.error ?? String(r.status) }),
        );
      }
    } catch (e) {
      setStatusMsg(
        t(lang, 'source.statusMsg.error', {
          err: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setSavingKey(null);
    }
  };

  const forgetPref = async (key: string) => {
    if (!confirm(t(lang, 'source.confirmForget', { key }))) return;
    setSavingKey(key);
    setStatusMsg(null);
    try {
      const r = await fetch(`/api/preferences?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (r.ok) {
        setStatusMsg(t(lang, 'source.statusMsg.forgot', { key }));
        await loadPrefs();
      } else {
        setStatusMsg(t(lang, 'source.statusMsg.error', { err: String(r.status) }));
      }
    } catch (e) {
      setStatusMsg(
        t(lang, 'source.statusMsg.error', {
          err: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setSavingKey(null);
    }
  };

  const prefMap = new Map<string, Preference>(prefs.map((p) => [p.key, p]));

  return (
    <aside
      className="flex h-full w-full flex-col border-r border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-sm">
            V
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">
              {t(lang, 'app.name')}
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              {t(lang, 'app.taglineShort')}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 lg:hidden"
          aria-label="Close sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* User pill */}
      {currentUser && (
        <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[11px] font-semibold text-white">
            {(currentUser.display_name || currentUser.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-medium">
              {currentUser.display_name || currentUser.email.split('@')[0]}
            </div>
            <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
              {currentUser.email}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="shrink-0 rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            title={lang === 'zh' ? '登出' : 'Logout'}
          >
            {lang === 'zh' ? '登出' : 'Logout'}
          </button>
        </div>
      )}

      {/* New chat */}
      <div className="px-3">
        <button
          onClick={onNew}
          className="group flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t(lang, 'sidebar.newChat')}
        </button>
      </div>

      {/* Recent chats */}
      <div className="mt-5 flex flex-1 flex-col overflow-hidden">
        <div className="mb-1.5 flex items-center justify-between px-5">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t(lang, 'sidebar.recent')}
          </h3>
          <button
            onClick={() => {
              onRefresh();
              if (sourcesOpen) loadPrefs();
            }}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title={t(lang, 'sidebar.refresh')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500">
              {t(lang, 'sidebar.emptyChats')}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className={`group flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? 'bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="line-clamp-1.5 w-full text-[13px] font-medium">
                      {c.title || (lang === 'zh' ? '无标题' : 'Untitled')}
                    </div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      {c.message_count} {t(lang, 'meta.msg')} ·{' '}
                      {timeAgo(c.updated_at, lang)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sources */}
      <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <button
          onClick={() => setSourcesOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
        >
          <span className="flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            {t(lang, 'sidebar.sources')}
          </span>
          <span className="text-zinc-400">{sourcesOpen ? '−' : '+'}</span>
        </button>
        {sourcesOpen && (
          <div className="mt-1 space-y-3 pb-1">
            {prefsLoading && (
              <div className="px-2 text-[10px] text-zinc-400">
                {t(lang, 'source.statusMsg.loading')}
              </div>
            )}
            {SOURCES.map((src) => {
              const pref = prefMap.get(src.prefKey);
              const isSet = pref?.has_value ?? false;
              const isEditing = editingKey === src.prefKey;
              const isSaving = savingKey === src.prefKey;
              return (
                <div key={src.prefKey} className="space-y-1 px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                      {t(lang, src.label)}
                    </span>
                    <span
                      className={`text-[9px] ${
                        isSet ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'
                      }`}
                    >
                      {isSet
                        ? t(lang, 'source.status.set')
                        : t(lang, 'source.status.unset')}
                    </span>
                  </div>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <input
                        type="password"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        placeholder={src.placeholder}
                        className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        autoFocus
                      />
                      <button
                        onClick={() => savePref(src.prefKey, editingValue)}
                        disabled={isSaving || !editingValue}
                        className="rounded-md bg-violet-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                      >
                        {isSaving ? '…' : t(lang, 'source.btn.save')}
                      </button>
                      <button
                        onClick={() => {
                          setEditingKey(null);
                          setEditingValue('');
                        }}
                        className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        {t(lang, 'source.btn.cancel')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <code className="flex-1 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
                        {isSet
                          ? src.prefKey
                          : t(lang, 'source.empty', { key: src.prefKey })}
                      </code>
                      <button
                        onClick={() => {
                          setEditingKey(src.prefKey);
                          setEditingValue('');
                        }}
                        disabled={isSaving}
                        className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        {isSet
                          ? t(lang, 'source.btn.replace')
                          : t(lang, 'source.btn.add')}
                      </button>
                      {isSet && (
                        <button
                          onClick={() => forgetPref(src.prefKey)}
                          disabled={isSaving}
                          className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] text-zinc-500 hover:bg-red-100 hover:text-red-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                        >
                          {t(lang, 'source.btn.forget')}
                        </button>
                      )}
                    </div>
                  )}
                  <p className="px-0.5 text-[10px] leading-snug text-zinc-400 dark:text-zinc-500">
                    {t(lang, src.hint)}
                  </p>
                </div>
              );
            })}
            {statusMsg && (
              <div className="px-1 text-[10px] text-violet-600 dark:text-violet-400">
                {statusMsg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Theme + Lang toggles (bottom) */}
      <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <div className="mb-2">
          <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t(lang, 'sidebar.theme.label')}
          </div>
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              onClick={() => setTheme('light')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                theme === 'light'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              {t(lang, 'sidebar.theme.light')}
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                theme === 'dark'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              {t(lang, 'sidebar.theme.dark')}
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t(lang, 'sidebar.lang.label')}
          </div>
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              onClick={() => setLang('zh')}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                lang === 'zh'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              中文
            </button>
            <button
              onClick={() => setLang('en')}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                lang === 'en'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming'>('idle');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrationDone, setHydrationDone] = useState(false);

  type CurrentUser = { id: string; email: string; display_name: string | null };
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_STORAGE_KEY, l);
    }
  }, []);

  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const setTheme = useCallback((th: Theme) => {
    setThemeState(th);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, th);
      if (th === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Apply theme on mount (re-hydrate from localStorage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setThemeState(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    } else {
      // Default: light
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const r = await fetch('/api/conversations', { cache: 'no-store' });
      if (r.ok) {
        const data = (await r.json()) as { conversations: ConversationSummary[] };
        setConversations(data.conversations ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  const switchToConversation = useCallback(async (id: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CONV_KEY, id);
    setConversationId(id);
    setError(null);
    setToolCalls([]);
    setStreamingText('');
    setStatus('idle');

    try {
      const r = await fetch(`/api/conversations/${id}/messages`, {
        cache: 'no-store',
      });
      if (!r.ok) {
        setMessages([]);
        return;
      }
      const data = (await r.json()) as {
        messages?: Array<{
          id: string;
          role: 'user' | 'assistant';
          content: string | null;
        }>;
      };
      const restored: DisplayMessage[] = (data.messages ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content ?? '',
        }));
      setMessages(restored);
    } catch {
      setMessages([]);
    }
  }, []);

  const startNewChat = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CONV_KEY);
    }
    setConversationId(null);
    setMessages([]);
    setToolCalls([]);
    setError(null);
    setStreamingText('');
    setStatus('idle');
  }, []);

  // Auth check on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
        if (meRes.status === 401 || !meRes.ok) {
          window.location.href = '/login';
          return;
        }
        const meData = (await meRes.json()) as { user: CurrentUser | null };
        if (!meData.user) {
          window.location.href = '/login';
          return;
        }
        setCurrentUser(meData.user);
        setAuthChecked(true);
      } catch {
        window.location.href = '/login';
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CONV_KEY);
    }
    window.location.href = '/login';
  }, []);

  // After auth: load lang + history + conv list
  useEffect(() => {
    if (!authChecked) return;
    if (typeof window === 'undefined') return;
    const savedLang = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (savedLang === 'zh' || savedLang === 'en') {
      setLangState(savedLang);
    }
    const saved = window.localStorage.getItem(CONV_KEY);
    refreshConversations();

    if (!saved) {
      setHydrationDone(true);
      return;
    }
    setConversationId(saved);
    (async () => {
      try {
        const r = await fetch(`/api/conversations/${saved}/messages`, {
          cache: 'no-store',
        });
        if (r.status === 404 || r.status === 401) {
          window.localStorage.removeItem(CONV_KEY);
          setConversationId(null);
          return;
        }
        if (!r.ok) {
          console.warn('[history] load failed:', r.status);
          return;
        }
        const data = (await r.json()) as {
          messages?: Array<{
            id: string;
            role: 'user' | 'assistant';
            content: string | null;
          }>;
        };
        const restored: DisplayMessage[] = (data.messages ?? [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content ?? '',
          }));
        if (restored.length > 0) setMessages(restored);
      } catch (e) {
        console.warn('[history] load error:', e);
      } finally {
        setHydrationDone(true);
      }
    })();
  }, [authChecked, refreshConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, toolCalls]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === 'streaming') return;

      setError(null);
      setToolCalls([]);

      const userMsg: DisplayMessage = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: trimmed,
      };

      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput('');
      setStatus('streaming');

      const streamId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setStreamingId(streamId);
      setStreamingText('');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history,
            conversationId: conversationIdRef.current,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = rawEvent.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;

            let evt: AgentEvent;
            try {
              evt = JSON.parse(payload);
            } catch {
              continue;
            }
            handleAgentEvent(evt, streamId);
          }
        }
        refreshConversations();
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setStatus('idle');
        setStreamingId(null);
        setStreamingText('');
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, status],
  );

  const handleAgentEvent = useCallback(
    (evt: AgentEvent, streamId: string) => {
      switch (evt.type) {
        case 'conversation_assigned':
          setConversationId(evt.conversationId);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(CONV_KEY, evt.conversationId);
          }
          break;
        case 'tool_start':
          setToolCalls((prev) => [
            ...prev,
            {
              id: evt.toolCallId,
              name: evt.name,
              args: evt.args,
              status: 'running',
              startedAt: Date.now(),
            },
          ]);
          break;
        case 'tool_end':
          setToolCalls((prev) =>
            prev.map((tc) =>
              tc.id === evt.toolCallId
                ? {
                    ...tc,
                    status: evt.ok ? 'done' : 'error',
                    result: evt.result,
                    ok: evt.ok,
                    error: evt.error,
                    endedAt: Date.now(),
                  }
                : tc,
            ),
          );
          break;
        case 'message_start':
          setStreamingText('');
          break;
        case 'message_delta':
          setStreamingText((prev) => prev + evt.content);
          break;
        case 'message_end':
          setMessages((prev) => [
            ...prev,
            { id: streamId, role: 'assistant', content: evt.content },
          ]);
          setStreamingText('');
          break;
        case 'error':
          setError(evt.message);
          break;
        case 'done':
          break;
      }
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isEmpty =
    hydrationDone && messages.length === 0 && toolCalls.length === 0;

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
        <div className="flex items-center gap-2 text-sm">
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {lang === 'zh' ? '加载中…' : 'Loading…'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {sidebarOpen && (
        <div className="hidden w-72 shrink-0 sm:block">
          <Sidebar
            lang={lang}
            setLang={setLang}
            theme={theme}
            setTheme={setTheme}
            conversations={conversations}
            activeId={conversationId}
            onSelect={switchToConversation}
            onNew={startNewChat}
            onRefresh={refreshConversations}
            onClose={() => setSidebarOpen(false)}
            currentUser={currentUser}
            onLogout={logout}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col">
        {/* Top bar — minimal */}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white/80 px-4 py-2.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
                aria-label="Open sidebar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
            )}
            <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
              {conversationId ? t(lang, 'topbar.chat') : t(lang, 'topbar.newChat')}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {t(lang, 'app.version')}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
            {isEmpty ? (
              <EmptyState lang={lang} onPick={(p) => send(p)} />
            ) : (
              <MessageList
                lang={lang}
                messages={messages}
                toolCalls={toolCalls}
                streamingId={streamingId}
                streamingText={streamingText}
                status={status}
                error={error}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        <Composer
          lang={lang}
          input={input}
          setInput={setInput}
          status={status}
          onSubmit={handleSubmit}
          onStop={stop}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────

function EmptyState({
  lang,
  onPick,
}: {
  lang: Lang;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center pt-6 text-center sm:pt-12">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 text-2xl font-bold text-white shadow-lg shadow-violet-500/20">
        V
      </div>
      <h1 className="bg-gradient-to-br from-zinc-900 to-zinc-600 bg-clip-text text-3xl font-semibold tracking-tight text-transparent dark:from-zinc-100 dark:to-zinc-400 sm:text-4xl">
        {t(lang, 'empty.greeting')}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-base">
        {t(lang, 'empty.body')}
      </p>

      <div className="mt-10 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTED_PROMPT_KEYS.map((p) => (
          <button
            key={p.title}
            onClick={() => onPick(t(lang, p.body))}
            className="group rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-px hover:border-violet-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-violet-700/50"
          >
            <div className="mb-1.5 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-zinc-100 dark:group-hover:text-violet-300">
              {t(lang, p.title)}
            </div>
            <div className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t(lang, p.body)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Message list / bubbles / tool cards / composer
// ─────────────────────────────────────────────────────────────────────

function MessageList({
  messages,
  toolCalls,
  streamingId,
  streamingText,
  status,
  error,
}: {
  lang: Lang;
  messages: DisplayMessage[];
  toolCalls: ToolCallDisplay[];
  streamingId: string | null;
  streamingText: string;
  status: 'idle' | 'streaming';
  error: string | null;
}) {
  const items: Array<
    | { kind: 'message'; msg: DisplayMessage }
    | { kind: 'streaming-bubble'; streamId: string; text: string }
    | { kind: 'tool'; tool: ToolCallDisplay }
    | { kind: 'error'; text: string }
  > = [];

  for (const m of messages) items.push({ kind: 'message', msg: m });
  for (const tc of toolCalls) items.push({ kind: 'tool', tool: tc });
  if (status === 'streaming' && streamingId) {
    items.push({
      kind: 'streaming-bubble',
      streamId: streamingId,
      text: streamingText,
    });
  }
  if (error) items.push({ kind: 'error', text: error });

  return (
    <div className="flex flex-col gap-6">
      {items.map((it, i) => {
        if (it.kind === 'message') return <Bubble key={it.msg.id} msg={it.msg} />;
        if (it.kind === 'streaming-bubble')
          return (
            <AssistantStreamBubble
              key={it.streamId}
              text={it.text}
              streaming={true}
            />
          );
        if (it.kind === 'tool') return <ToolCard key={it.tool.id} tool={it.tool} />;
        return (
          <div
            key={`err${i}`}
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <strong className="font-semibold">Error:</strong> {it.text}
          </div>
        );
      })}
    </div>
  );
}

function Bubble({ msg }: { msg: DisplayMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm text-white shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }
  return <AssistantStreamBubble text={msg.content} streaming={false} />;
}

function AssistantStreamBubble({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] text-sm leading-7 text-zinc-800 dark:text-zinc-200">
        <div className="prose prose-zinc max-w-none whitespace-pre-wrap break-words dark:prose-invert">
          {text}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-violet-500" />
          )}
        </div>
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolCallDisplay }) {
  const [open, setOpen] = useState(false);
  const durationMs =
    tool.endedAt && tool.startedAt ? tool.endedAt - tool.startedAt : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
      >
        <div className="flex items-center gap-2">
          <StatusDot status={tool.status} />
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {tool.name}
          </span>
          {durationMs !== null && (
            <span className="text-zinc-400 dark:text-zinc-500">
              {durationMs}ms
            </span>
          )}
        </div>
        <span className="text-zinc-400 dark:text-zinc-500">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
          <div className="mb-1 text-zinc-400 dark:text-zinc-500">args</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
          <div className="mb-1 mt-3 text-zinc-400 dark:text-zinc-500">
            {tool.ok === false ? 'error' : 'result'}
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-zinc-700 dark:text-zinc-300">
            {tool.error
              ? tool.error
              : JSON.stringify(tool.result, null, 2).slice(0, 4000)}
          </pre>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: ToolCallDisplay['status'] }) {
  const color =
    status === 'running'
      ? 'bg-amber-500'
      : status === 'done'
        ? 'bg-emerald-500'
        : 'bg-red-500';
  const pulse = status === 'running' ? 'animate-pulse' : '';
  return <span className={`inline-block h-2 w-2 rounded-full ${color} ${pulse}`} />;
}

function Composer({
  input,
  setInput,
  status,
  onSubmit,
  onStop,
  onKeyDown,
  inputRef,
}: {
  lang: Lang;
  input: string;
  setInput: (v: string) => void;
  status: 'idle' | 'streaming';
  onSubmit: (e?: React.FormEvent) => void;
  onStop: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const streaming = status === 'streaming';
  return (
    <div className="border-t border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex max-w-3xl items-end gap-2"
      >
        <div className="flex-1 rounded-2xl border border-zinc-200 bg-white shadow-sm transition focus-within:border-violet-400 focus-within:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-violet-500">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              streaming
                ? 'agent 跑着呢…'
                : '说点啥。Enter 发送,Shift+Enter 换行。'
            }
            disabled={streaming}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:opacity-50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </form>
      <div className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-zinc-400 dark:text-zinc-500">
        viralpost 会自己调工具 · 工具调用过程在对话流里能看到
      </div>
    </div>
  );
}
