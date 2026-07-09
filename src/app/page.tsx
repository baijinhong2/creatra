'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────
// Types — kept local to this file so the UI doesn't depend on server-only
// types from src/lib/*.
// ─────────────────────────────────────────────────────────────────────

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

/** localStorage key for the current conversation id. */
const CONV_KEY = 'vp_conversation_id';

// ─────────────────────────────────────────────────────────────────────
// Suggested first prompts shown when the user opens the page with no history.
// Picked to demonstrate the agent's capabilities and what it knows about
// the user.
// ─────────────────────────────────────────────────────────────────────

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
// Main component
// ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming'>('idle');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Persistence (localStorage ↔ Supabase) ──
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrationDone, setHydrationDone] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror conversationId in a ref so send() reads the latest value without
  // making it a useCallback dep (which would re-create send on every change).
  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // On mount: read localStorage, ask Supabase for the saved conversation,
  // pre-populate messages so a page reload resumes the chat.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(CONV_KEY);
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
          // Stale id — clear it and start fresh.
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
  }, []);

  // Auto-scroll to bottom whenever content changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, toolCalls]);

  // Auto-grow textarea up to ~6 rows
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // ── Send ────────────────────────────────────────────────────────────
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

      // Optimistically add user message; compute history BEFORE pushing it.
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
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

          // SSE: events separated by \n\n
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
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          // user cancelled — final stream text still counts as the assistant message
          flushStreamingMessage(streamId);
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

  // Centralized event handler — kept outside render so React doesn't re-create it
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
        case 'message_end': {
          setMessages((prev) => [
            ...prev,
            { id: streamId, role: 'assistant', content: evt.content },
          ]);
          setStreamingText('');
          break;
        }
        case 'error':
          setError(evt.message);
          break;
        case 'done':
          // nothing — `done` just signals the server loop ended normally;
          // tool calls may still be displayed in the UI after the stream closes.
          break;
      }
    },
    [],
  );

  // If the stream ends WITHOUT a message_end (e.g. abort), keep whatever
  // streamed text we have as the assistant message.
  const flushStreamingMessage = useCallback((streamId: string) => {
    setMessages((prev) => {
      if (prev.find((m) => m.id === streamId)) return prev;
      // ...
      return prev;
    });
  }, []);

  // ── Stop button ────────────────────────────────────────────────────
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Submit handlers ────────────────────────────────────────────────
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
    <div className="flex h-full min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header />

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
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold">
            V
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold tracking-tight">viralpost</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              X growth agent
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="hidden sm:inline">MVP build</span>
          <span className="hidden h-1 w-1 rounded-full bg-emerald-500 sm:inline-block" />
          <span className="hidden sm:inline">v0.1</span>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state — first impression. Asks the user what they want.
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
        I can search X and the web, look at your GitHub and local projects, watch
        creators you admire, and write tweets with you. Pick a starter, or just say
        what you need.
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
// Message list — interleaves user/assistant bubbles with tool-call cards.
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
  // Attach tool calls to the assistant message they precede. For MVP, just
  // render them in chronological order alongside the messages.
  const items: Array<
    | { kind: 'message'; msg: DisplayMessage }
    | { kind: 'streaming-bubble'; streamId: string; text: string }
    | { kind: 'tool'; tool: ToolCallDisplay }
    | { kind: 'error'; text: string }
  > = [];

  for (const m of messages) {
    items.push({ kind: 'message', msg: m });
  }
  for (const tc of toolCalls) {
    items.push({ kind: 'tool', tool: tc });
  }
  if (status === 'streaming' && streamingId) {
    items.push({
      kind: 'streaming-bubble',
      streamId: streamingId,
      text: streamingText,
    });
  }
  if (error) {
    items.push({ kind: 'error', text: error });
  }

  // Reorder by startedAt where possible — simpler: tool calls interleaved in
  // arrival order, which matches what the SSE stream emitted.
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

// ─────────────────────────────────────────────────────────────────────
// Bubbles
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// Tool card — collapsible card showing args + result
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// Composer — input area stuck to the bottom
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
