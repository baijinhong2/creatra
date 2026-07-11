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
import {
  MODELS,
  DEFAULT_MODEL,
  MODEL_STORAGE_KEY,
  type ModelId,
  getModel,
} from '@/lib/models';

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

// 8 skill entry points (1:1 with the system prompt's skill catalog).
const SUGGESTED_PROMPT_KEYS: { title: DictKey; body: DictKey }[] = [
  { title: 'prompt.positioning.title', body: 'prompt.positioning.body' },
  { title: 'prompt.brand.title', body: 'prompt.brand.body' },
  { title: 'prompt.creators.title', body: 'prompt.creators.body' },
  { title: 'prompt.strategy.title', body: 'prompt.strategy.body' },
  { title: 'prompt.daily.title', body: 'prompt.daily.body' },
  { title: 'prompt.replies.title', body: 'prompt.replies.body' },
  { title: 'prompt.engage.title', body: 'prompt.engage.body' },
  { title: 'prompt.analytics.title', body: 'prompt.analytics.body' },
];

// ─────────────────────────────────────────────────────────────────────
// Sidebar (ChatGPT-style: minimal + collapsible sources + user pill at bottom)
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

function Sidebar({
  lang,
  setLang,
  theme,
  setTheme,
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
  currentUser,
  onLogout,
  narrow,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  currentUser: { id: string; email: string; display_name: string | null } | null;
  onLogout: () => void;
  narrow: boolean;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Inline sidebar colors (no `dark:` Tailwind) — avoids the Chromium
  // dark-mode compositing bug where descendants render as the aside's bg.
  const sidebarBg = theme === 'dark' ? '#09090b' : '#fafafa';
  const sidebarText = theme === 'dark' ? '#fafafa' : '#18181b';
  const sidebarBorder = theme === 'dark' ? '#27272a' : '#e4e4e7';

  return (
    <aside
      className="flex h-full w-full flex-col"
      style={{ backgroundColor: sidebarBg, color: sidebarText }}
    >
      {/* Brand row + collapse toggle */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2 px-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 text-[13px] font-bold text-white shadow-sm">
            V
          </div>
          {!narrow && (
            <span className="text-[14px] font-semibold tracking-tight">
              viralpost
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19l-7-7 7-7M21 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* New chat */}
      <div className="px-3 pt-3">
        <button
          onClick={onNew}
          title={t(lang, 'sidebar.newChat')}
          className={`flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-[13px] font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${narrow ? 'justify-center px-0' : ''}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {!narrow && t(lang, 'sidebar.newChat')}
        </button>
      </div>

      {/* Recent chats */}
      <div className="mt-5 flex flex-1 flex-col overflow-hidden px-1.5">
        {!narrow && (
          <h3 className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t(lang, 'sidebar.recent')}
          </h3>
        )}
        <div className="flex-1 overflow-y-auto pb-2">
          {conversations.length === 0 ? (
            !narrow && (
              <p className="px-3 py-2 text-[12px] text-zinc-400 dark:text-zinc-500">
                {t(lang, 'sidebar.emptyChats')}
              </p>
            )
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    title={c.title || (lang === 'zh' ? '无标题' : 'Untitled')}
                    className={`group ${narrow ? 'flex items-center justify-center px-0 py-2' : 'flex flex-col items-start gap-0.5 px-3 py-2'} rounded-lg text-left text-[13px] transition ${
                      isActive
                        ? 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-600 hover:bg-zinc-200/40 dark:text-zinc-400 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    {narrow ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : (
                      <>
                        <div className="line-clamp-1 w-full">{c.title || (lang === 'zh' ? '无标题' : 'Untitled')}</div>
                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {timeAgo(c.updated_at, lang)}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sources — collapsed by default, very compact */}
      <div className="border-t border-zinc-200 px-1.5 py-2 dark:border-zinc-800">
        <button
          onClick={() => setSourcesOpen((o) => !o)}
          title={t(lang, 'sidebar.sources')}
          className={`flex w-full items-center ${narrow ? 'justify-center px-0' : 'justify-between'} gap-2 rounded-md px-3 py-1.5 text-[12px] text-zinc-600 transition hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-50`}
        >
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!narrow && t(lang, 'sidebar.sources')}
          </span>
          {!narrow && <span>{sourcesOpen ? '−' : '+'}</span>}
        </button>
        {sourcesOpen && !narrow && (
          <div className="mt-2 px-2">
            <SourcesPanel lang={lang} />
          </div>
        )}
      </div>

      {/* User pill — at the very bottom of the sidebar (ChatGPT pattern). */}
      {currentUser && !narrow && (
        <div className="border-t border-zinc-200 px-1.5 py-2 dark:border-zinc-800">
          <UserMenu
            user={currentUser}
            lang={lang}
            setLang={setLang}
            theme={theme}
            setTheme={setTheme}
            onLogout={onLogout}
          />
        </div>
      )}
      {/* When sidebar is collapsed, show user avatar as a small icon at the
          bottom (so the menu is still accessible). */}
      {currentUser && narrow && (
        <div className="border-t border-zinc-200 px-1.5 py-2 dark:border-zinc-800">
          <UserMenu
            user={currentUser}
            lang={lang}
            setLang={setLang}
            theme={theme}
            setTheme={setTheme}
            onLogout={onLogout}
            compact
          />
        </div>
      )}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sources panel (sub-component — used inside the sidebar)
// ─────────────────────────────────────────────────────────────────────

function SourcesPanel({ lang }: { lang: Lang }) {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/preferences', { cache: 'no-store' });
      if (r.ok) {
        const data = (await r.json()) as { preferences: Preference[] };
        setPrefs(data.preferences ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      const r = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (r.ok) {
        setEditingKey(null);
        setEditingValue('');
        await load();
      }
    } finally {
      setSavingKey(null);
    }
  };

  const forget = async (key: string) => {
    if (!confirm(t(lang, 'source.confirmForget', { key }))) return;
    setSavingKey(key);
    try {
      await fetch(`/api/preferences?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="py-2 text-center text-[10px] text-zinc-400">
        {t(lang, 'source.statusMsg.loading')}
      </div>
    );
  }

  const prefMap = new Map<string, Preference>(prefs.map((p) => [p.key, p]));

  return (
    <div className="space-y-2">
      {SOURCES.map((src) => {
        const pref = prefMap.get(src.prefKey);
        const isSet = pref?.has_value ?? false;
        const isEditing = editingKey === src.prefKey;
        const isSaving = savingKey === src.prefKey;
        return (
          <div key={src.prefKey} className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                {t(lang, src.label)}
              </span>
              <span
                className={`text-[9px] ${
                  isSet ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'
                }`}
              >
                {isSet ? t(lang, 'source.status.set') : t(lang, 'source.status.unset')}
              </span>
            </div>
            {isEditing ? (
              <div className="flex gap-1">
                <input
                  type="password"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  placeholder={src.placeholder}
                  className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  autoFocus
                />
                <button
                  onClick={() => save(src.prefKey, editingValue)}
                  disabled={isSaving || !editingValue}
                  className="rounded bg-violet-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                >
                  {isSaving ? '…' : t(lang, 'source.btn.save')}
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <code className="flex-1 truncate rounded border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-500">
                  {isSet ? src.prefKey : t(lang, 'source.empty', { key: src.prefKey })}
                </code>
                <button
                  onClick={() => {
                    setEditingKey(src.prefKey);
                    setEditingValue('');
                  }}
                  className="rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {isSet ? t(lang, 'source.btn.replace') : t(lang, 'source.btn.add')}
                </button>
                {isSet && (
                  <button
                    onClick={() => forget(src.prefKey)}
                    className="rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-500 hover:bg-red-100 hover:text-red-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                  >
                    {t(lang, 'source.btn.forget')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// User menu popover (ChatGPT pattern: click avatar → small menu bottom-left)
// ─────────────────────────────────────────────────────────────────────

function UserMenu({
  user,
  lang,
  setLang,
  theme,
  setTheme,
  onLogout,
  compact,
}: {
  user: { email: string; display_name: string | null };
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onLogout: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initial = (user.display_name || user.email).charAt(0).toUpperCase();

  // Inline styles only — no `dark:` Tailwind classes on the pill or dropdown
  // to avoid the Chromium dark-mode compositing bug inside a `dark:`-classed
  // sidebar ancestor.
  const pillBg = theme === 'dark' ? '#1f2937' : '#ffffff';
  const pillColor = theme === 'dark' ? '#ffffff' : '#18181b';
  const dropdownBg = theme === 'dark' ? '#18181b' : '#ffffff';
  const dropdownBorder = theme === 'dark' ? '#27272a' : '#e4e4e7';
  const dropdownDivider = theme === 'dark' ? '#27272a' : '#f4f4f5';
  const dropdownText = theme === 'dark' ? '#fafafa' : '#18181b';
  const dropdownMuted = theme === 'dark' ? '#a1a1aa' : '#71717a';
  const dropdownHover = theme === 'dark' ? '#27272a' : '#f4f4f5';
  const activeTabBg = theme === 'dark' ? '#27272a' : '#f4f4f5';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: compact ? 'center' : 'flex-start',
          gap: '10px',
          padding: compact ? '6px' : '10px',
          borderRadius: '10px',
          border: compact ? 'none' : '2px solid #a78bfa',
          backgroundColor: compact ? 'transparent' : pillBg,
          color: pillColor,
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: compact ? 'none' : '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        title={t(lang, 'menu.userMenuAria')}
        aria-label={t(lang, 'menu.userMenuAria')}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        {!compact && (
          <>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.display_name || user.email.split('@')[0]}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.7 }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            left: compact ? '52px' : '0',
            bottom: compact ? '0' : 'calc(100% + 8px)',
            width: '240px',
            zIndex: 50,
            backgroundColor: dropdownBg,
            border: `1px solid ${dropdownBorder}`,
            borderRadius: '12px',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.18)',
            color: dropdownText,
            overflow: 'hidden',
          }}
        >
          <div style={{ borderBottom: `1px solid ${dropdownDivider}`, padding: '10px 12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>
              {user.display_name || user.email}
            </div>
            <div style={{ fontSize: '10px', color: dropdownMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
          </div>

          <div style={{ borderBottom: `1px solid ${dropdownDivider}`, padding: '8px 10px' }}>
            <div style={{ padding: '0 0 4px', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: dropdownMuted }}>
              {t(lang, 'menu.theme')}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setTheme('light')}
                style={{
                  flex: 1,
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: theme === 'light' ? activeTabBg : 'transparent',
                  color: theme === 'light' ? dropdownText : dropdownMuted,
                }}
              >
                ☀ {t(lang, 'menu.theme.light')}
              </button>
              <button
                onClick={() => setTheme('dark')}
                style={{
                  flex: 1,
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: theme === 'dark' ? activeTabBg : 'transparent',
                  color: theme === 'dark' ? dropdownText : dropdownMuted,
                }}
              >
                ☾ {t(lang, 'menu.theme.dark')}
              </button>
            </div>
          </div>

          <div style={{ borderBottom: `1px solid ${dropdownDivider}`, padding: '8px 10px' }}>
            <div style={{ padding: '0 0 4px', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: dropdownMuted }}>
              {t(lang, 'menu.language')}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setLang('zh')}
                style={{
                  flex: 1,
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: lang === 'zh' ? activeTabBg : 'transparent',
                  color: lang === 'zh' ? dropdownText : dropdownMuted,
                }}
              >
                中文
              </button>
              <button
                onClick={() => setLang('en')}
                style={{
                  flex: 1,
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: lang === 'en' ? activeTabBg : 'transparent',
                  color: lang === 'en' ? dropdownText : dropdownMuted,
                }}
              >
                English
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              textAlign: 'left',
              fontSize: '12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dropdownText,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = dropdownHover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
          >
            {t(lang, 'menu.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Model picker (topbar) — click the model name → dropdown of available
// models. Each item shows a short description; the active one is checked.

function ModelPicker({
  model,
  setModel,
}: {
  model: ModelId;
  setModel: (m: ModelId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === model) ?? MODELS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full px-1 py-0.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
        aria-label="Select model"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-[300px] -translate-x-1/2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            切换模型
          </div>
          {MODELS.map((m) => {
            const active = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setModel(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {m.badge}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                      {m.label}
                    </span>
                    {active && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {m.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
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
      document.documentElement.classList.toggle('dark', th === 'dark');
    }
  }, []);

  // Selected LLM model. Persisted to localStorage; defaults to flash.
  const [model, setModelState] = useState<ModelId>(DEFAULT_MODEL);
  const setModel = useCallback((m: ModelId) => {
    setModelState(m);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MODEL_STORAGE_KEY, m);
    }
  }, []);

  // Sidebar collapses from 260px to 60px (icon rail). Never unmounts.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 60 : 260;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Re-hydrate theme
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      setThemeState(saved);
      document.documentElement.classList.toggle('dark', saved === 'dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Re-hydrate model selection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved === 'deepseek-v4-flash' || saved === 'deepseek-v4-pro') {
      setModelState(saved);
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
    setTimeout(() => inputRef.current?.focus(), 50);
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
      setTimeout(() => inputRef.current?.focus(), 100);
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
        if (!r.ok) return;
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
      } catch {
        // ignore
      } finally {
        setHydrationDone(true);
        setTimeout(() => inputRef.current?.focus(), 100);
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
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
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
            model,
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
      <div className="flex h-screen items-center justify-center bg-white text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
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
    <div className="flex h-screen overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div
        className="hidden h-full shrink-0 sm:block"
        style={{ width: `${sidebarWidth}px`, transition: 'width 200ms ease' }}
      >
        <Sidebar
          lang={lang}
          setLang={setLang}
          theme={theme}
          setTheme={setTheme}
          conversations={conversations}
          activeId={conversationId}
          onSelect={switchToConversation}
          onNew={startNewChat}
          onClose={() => setSidebarCollapsed(true)}
          currentUser={currentUser}
          onLogout={logout}
          narrow={sidebarCollapsed}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — ChatGPT style: centered model label, share button on right */}
        <header className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                aria-label="Expand sidebar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60">
            <span>viralpost</span>
            <span className="text-zinc-400">·</span>
            <ModelPicker
              model={model}
              setModel={setModel}
            />
          </div>
          <div className="flex items-center gap-2">
            {/* Right side intentionally empty — user menu lives in sidebar bottom (ChatGPT pattern) */}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4">
            {isEmpty ? (
              <EmptyState lang={lang} onPick={(p) => send(p)} />
            ) : (
              <MessageList
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
// Empty state — minimal greeting + 8 starter cards
// ─────────────────────────────────────────────────────────────────────

function EmptyState({
  lang,
  onPick,
}: {
  lang: Lang;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center pt-12 text-center sm:pt-20">
      <h1 className="text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[32px]">
        {lang === 'zh' ? '你好,我是 viralpost' : "Hi, I'm viralpost"}
      </h1>
      <p className="mt-2 text-[14px] text-zinc-500 dark:text-zinc-400">
        {lang === 'zh'
          ? '你的 X 运营合伙人 · 8 件事都能干'
          : 'Your X ops partner · 8 capabilities'}
      </p>

      <div className="mt-10 grid w-full max-w-3xl grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {SUGGESTED_PROMPT_KEYS.map((p) => (
          <button
            key={p.title}
            onClick={() => onPick(t(lang, p.body))}
            className="group flex h-full flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-white p-3.5 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
          >
            <div className="text-[13px] font-medium text-zinc-800 group-hover:text-violet-600 dark:text-zinc-100 dark:group-hover:text-violet-300">
              {t(lang, p.title)}
            </div>
            <div className="line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              {t(lang, p.body)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Message list — ChatGPT-style: assistant has no bubble, just text
// ─────────────────────────────────────────────────────────────────────

function MessageList({
  messages,
  toolCalls,
  streamingId,
  streamingText,
  status,
  error,
}: {
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
    <div className="flex flex-col gap-7">
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
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
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
    // ChatGPT: user messages have a subtle rounded bg, no bubble border.
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2 text-[14px] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
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
  // Assistant: no bubble, no border, just well-formatted text.
  return (
    <div className="flex items-start gap-2">
      <div className="text-[14px] leading-7 text-zinc-800 dark:text-zinc-200">
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
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-[12px] dark:border-zinc-800 dark:bg-zinc-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
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
        <div className="border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
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

// ─────────────────────────────────────────────────────────────────────
// Composer — ChatGPT-style: floating pill, centered, more prominent
// ─────────────────────────────────────────────────────────────────────

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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white to-white/0 pb-4 pt-12 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950/0">
      <form
        onSubmit={onSubmit}
        className="pointer-events-auto mx-auto flex max-w-3xl items-end gap-2 px-4"
      >
        <div className="flex-1 rounded-3xl border border-zinc-200 bg-white shadow-sm transition focus-within:border-zinc-300 focus-within:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-zinc-700">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              streaming
                ? 'agent 跑着呢…'
                : '问点啥,Enter 发送,Shift+Enter 换行'
            }
            disabled={streaming}
            className="w-full resize-none bg-transparent px-5 py-3.5 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:opacity-50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            style={{ minHeight: '24px', maxHeight: '220px' }}
          />
        </div>
        <button
          type={streaming ? 'button' : 'submit'}
          onClick={streaming ? onStop : undefined}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-30 ${
            streaming
              ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
              : 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white'
          }`}
          disabled={!streaming && !input.trim()}
          aria-label={streaming ? 'Stop' : 'Send'}
        >
          {streaming ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </form>
      <div className="mx-auto mt-2 max-w-3xl px-4 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
        viralpost 会自己调工具 · 调用过程在对话流里能看到
      </div>
    </div>
  );
}
