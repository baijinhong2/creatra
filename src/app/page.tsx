'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

const SUGGESTED_PROMPTS = [
  {
    title: 'Audit my account',
    body: "What's the current state of my X account? Where should I focus first?",
  },
  {
    title: 'Find creators to follow',
    body: 'Find me 5 indie developers or AI builders on X I should follow right now.',
  },
  {
    title: 'Build-in-public draft',
    body: 'Look at my GitHub repos and suggest a build-in-public tweet for today.',
  },
  {
    title: 'Trends + angles',
    body: 'Search X and the web for trending AI/indie-hacker topics today and give me 3 angles I could tweet.',
  },
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
  key: string;
  label: string;
  placeholder: string;
  hint: string;
};

const SOURCES: Source[] = [
  {
    key: 'github.token',
    label: 'GitHub token',
    placeholder: 'ghp_xxx or gho_xxx',
    hint: 'Used by github_read. Optional — without it you get 60 req/hour.',
  },
  {
    key: 'tavily.key',
    label: 'Tavily API key',
    placeholder: 'tvly-xxx',
    hint: 'Used by web_search. Get one at tavily.com.',
  },
  {
    key: 'x.auth_token',
    label: 'X (Twitter) auth_token',
    placeholder: 'auth_token cookie value',
    hint: 'Used by twitter_search / twitter_get_user_tweets. From browser devtools.',
  },
  {
    key: 'x.ct0',
    label: 'X (Twitter) ct0',
    placeholder: 'ct0 cookie value',
    hint: 'X CSRF token. Pairs with auth_token.',
  },
];

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRefresh,
  onClose,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRefresh: () => void;
  onClose: () => void;
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
        setStatusMsg(`saved ${key}`);
        setEditingKey(null);
        setEditingValue('');
        await loadPrefs();
      } else {
        const err = (await r.json()) as { error?: string };
        setStatusMsg(`error: ${err.error ?? r.status}`);
      }
    } catch (e) {
      setStatusMsg(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingKey(null);
    }
  };

  const forgetPref = async (key: string) => {
    if (!confirm(`Forget ${key}?`)) return;
    setSavingKey(key);
    setStatusMsg(null);
    try {
      const r = await fetch(`/api/preferences?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (r.ok) {
        setStatusMsg(`forgot ${key}`);
        await loadPrefs();
      } else {
        setStatusMsg(`error: HTTP ${r.status}`);
      }
    } catch (e) {
      setStatusMsg(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingKey(null);
    }
  };

  const prefMap = new Map<string, Preference>(prefs.map((p) => [p.key, p]));

  return (
    <aside className="flex h-full w-full flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold">
            V
          </div>
          <span className="font-semibold tracking-tight">viralpost</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 lg:hidden"
          aria-label="Close sidebar"
        >
          ✕
        </button>
      </div>

      {/* New chat */}
      <div className="px-3 pt-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:border-violet-500/50 hover:bg-zinc-800"
        >
          <span className="text-base leading-none">+</span> New chat
        </button>
      </div>

      {/* Conversations list */}
      <div className="mt-4 flex-1 overflow-y-auto px-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Recent
          </h3>
          <button
            onClick={() => {
              onRefresh();
              if (sourcesOpen) loadPrefs();
            }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300"
            title="Refresh"
          >
            ↻
          </button>
        </div>
        {conversations.length === 0 ? (
          <p className="text-xs text-zinc-500">No chats yet — start one ↑</p>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`group flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? 'border-violet-500/40 bg-violet-500/10'
                      : 'border-transparent hover:border-zinc-700 hover:bg-zinc-900'
                  }`}
                >
                  <div className="line-clamp-2 w-full text-zinc-100">
                    {c.title || 'Untitled'}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {c.message_count} {c.message_count === 1 ? 'msg' : 'msgs'}{' '}
                    · {timeAgo(c.updated_at)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sources (collapsible) */}
      <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
        <button
          onClick={() => setSourcesOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded px-1 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
        >
          <span>Sources</span>
          <span>{sourcesOpen ? '▾' : '▸'}</span>
        </button>
        {sourcesOpen && (
          <div className="mt-2 space-y-3">
            {prefsLoading && (
              <div className="text-[10px] text-zinc-500">loading…</div>
            )}
            {SOURCES.map((src) => {
              const pref = prefMap.get(src.key);
              const isSet = pref?.has_value ?? false;
              const isEditing = editingKey === src.key;
              const isSaving = savingKey === src.key;
              return (
                <div key={src.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-300">
                      {src.label}
                    </label>
                    <span
                      className={`text-[10px] ${
                        isSet ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                    >
                      {isSet ? '● set' : '○ not set'}
                    </span>
                  </div>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <input
                        type="password"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        placeholder={src.placeholder}
                        className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 focus:border-violet-500/50 focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => savePref(src.key, editingValue)}
                        disabled={isSaving || !editingValue}
                        className="rounded bg-violet-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                      >
                        {isSaving ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingKey(null);
                          setEditingValue('');
                        }}
                        className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <code className="flex-1 truncate rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1 font-mono text-[11px] text-zinc-500">
                        {isSet ? src.key : `(empty: ${src.key})`}
                      </code>
                      <button
                        onClick={() => {
                          setEditingKey(src.key);
                          setEditingValue('');
                        }}
                        disabled={isSaving}
                        className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700"
                      >
                        {isSet ? 'Replace' : 'Add'}
                      </button>
                      {isSet && (
                        <button
                          onClick={() => forgetPref(src.key)}
                          disabled={isSaving}
                          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-red-900/40 hover:text-red-200"
                        >
                          Forget
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] leading-snug text-zinc-600">
                    {src.hint}
                  </p>
                </div>
              );
            })}
            {statusMsg && (
              <div className="text-[10px] text-violet-400">{statusMsg}</div>
            )}
          </div>
        )}
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

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    [],
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // ── Load conversation list (also after every send) ──
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

  // ── Switch to a specific conversation ──
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

  // ── New chat: clear local + server assigns new id on next message ──
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

  // ── On mount: load localStorage → fetch history + load conv list ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
        if (r.status === 404) {
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
  }, [refreshConversations]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, toolCalls]);

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // ── Send ─────────────────────────────────────────────────────────────
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

        // After stream closes, refresh conversation list (title may have updated,
        // new conversation may have been created).
        refreshConversations();
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          // user cancelled
        } else {
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

  return (
    <div className="flex h-full min-h-screen bg-zinc-950 text-zinc-100">
      {sidebarOpen && (
        <div className="w-72 shrink-0 lg:w-80">
          <Sidebar
            conversations={conversations}
            activeId={conversationId}
            onSelect={switchToConversation}
            onNew={startNewChat}
            onRefresh={refreshConversations}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              >
                ☰
              </button>
            )}
            <span className="text-xs text-zinc-500">
              {conversationId ? 'Chat' : 'New chat'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="hidden sm:inline">MVP build</span>
            <span className="hidden h-1 w-1 rounded-full bg-emerald-500 sm:inline-block" />
            <span className="hidden sm:inline">v0.2</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
            {isEmpty ? (
              <EmptyState onPick={(p) => send(p)} />
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

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center pt-8 text-center sm:pt-16">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl font-bold shadow-lg shadow-violet-500/20">
        V
      </div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Hi — I'm your X growth agent.
      </h1>
      <p className="mt-3 max-w-md text-sm text-zinc-400 sm:text-base">
        I can search X and the web, look at your GitHub, watch creators you
        admire, and write tweets with you. Pick a starter, or just say what you
        need.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p.title}
            onClick={() => onPick(p.body)}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition hover:border-violet-500/40 hover:bg-zinc-900"
          >
            <div className="text-sm font-medium text-zinc-200 group-hover:text-violet-300">
              {p.title}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{p.body}</div>
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
            className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200"
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
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600 px-4 py-2.5 text-sm text-white shadow-sm">
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
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm leading-7 text-zinc-100">
        <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap break-words">
          {text}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-violet-400" />
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <StatusDot status={tool.status} />
          <span className="font-mono text-zinc-300">{tool.name}</span>
          {durationMs !== null && (
            <span className="text-zinc-600">{durationMs}ms</span>
          )}
        </div>
        <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-3 py-2 font-mono text-[11px] text-zinc-400">
          <div className="mb-1 text-zinc-500">args</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
          <div className="mb-1 mt-3 text-zinc-500">
            {tool.ok === false ? 'error' : 'result'}
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-zinc-300">
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
      ? 'bg-amber-400 animate-pulse'
      : status === 'done'
        ? 'bg-emerald-400'
        : 'bg-red-400';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
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
    <div className="border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-4"
      >
        <div className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900 transition focus-within:border-violet-500/50">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              streaming ? 'Agent is running…' : 'Ask anything. Enter to send.'
            }
            disabled={streaming}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
          />
        </div>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-11 shrink-0 items-center justify-center rounded-full bg-violet-600 px-4 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        )}
      </form>
      <div className="mx-auto max-w-3xl px-4 pb-3 text-[10px] text-zinc-600">
        viralpost is an autonomous agent — it can call tools. Inspect tool calls
        in the stream.
      </div>
    </div>
  );
}
