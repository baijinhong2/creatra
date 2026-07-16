'use client';

import { useState, useEffect, useCallback } from'react';
import { XHandleSetup } from'./XHandleSetup';
import { ICON } from'@/lib/design';

type Reply = {
 id: string;
 parent_tweet_text: string;
 reply_author_handle: string | null;
 reply_author_name: string | null;
 reply_author_avatar: string | null;
 reply_text: string;
 reply_metrics: Record<string, number> | null;
 pulled_at: string;
 status:'new'|'drafted'|'handled'|'skipped';
 drafted_response: string | null;
 draft_meta: { drafts?: Array<{ text: string; strategy: string; why_this: string }> } | null;
};

type Counts = Record<string, number>;

type Status ='idle'|'loading'|'drafting';

export function InboxPanel({ onClose }: { onClose: () => void }) {
 const [tab, setTab] = useState<'new'|'handled'|'all'>('new');
 const [replies, setReplies] = useState<Reply[]>([]);
 const [counts, setCounts] = useState<Counts>({ new: 0, drafted: 0, handled: 0, skipped: 0 });
 const [loading, setLoading] = useState(false);
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [drafting, setDrafting] = useState<Record<string, Status>>({});
 const [syncing, setSyncing] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [xHandle, setXHandle] = useState<string | null>(null);
 const [xHandleLoaded, setXHandleLoaded] = useState(false);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const status = tab ==='new'?'new': tab ==='handled'?'handled': undefined;
 const r = await fetch(`/api/replies${status ? `?status=${status}` :''}`);
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 const j = await r.json();
 setReplies(j.replies);
 setCounts(j.counts);
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setLoading(false);
 }
 }, [tab]);

 useEffect(() => {
 load();
 }, [load]);

 // Load x_handle from /api/account/x-handle
 useEffect(() => {
 (async () => {
 try {
 const r = await fetch('/api/account/x-handle');
 if (r.ok) {
 const j = await r.json();
 setXHandle(j.x_handle ?? null);
 }
 } catch {}
 setXHandleLoaded(true);
 })();
 }, []);

 const onSync = async () => {
 if (!xHandle) {
 setError('先设置 X 账号');
 return;
 }
 setSyncing(true);
 setError(null);
 try {
 const r = await fetch('/api/replies/sync', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ user_handle: xHandle, force: true }),
 });
 const j = await r.json();
 if (!r.ok) {
 throw new Error(j.message || j.error || `HTTP ${r.status}`);
 }
 await load();
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setSyncing(false);
 }
 };

 const onDraft = async (replyId: string) => {
 setDrafting((d) => ({ ...d, [replyId]:'drafting'}));
 try {
 const r = await fetch('/api/replies/draft', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ reply_inbox_id: replyId, count: 3 }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 setExpandedId(replyId);
 await load();
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setDrafting((d) => ({ ...d, [replyId]:'idle'}));
 }
 };

 const onAction = async (replyId: string, action:'mark_handled'|'mark_skipped') => {
 try {
 const r = await fetch(`/api/replies/${replyId}`, {
 method:'PATCH',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ action }),
 });
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 await load();
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 }
 };

 return (
 <div className="flex h-full flex-col bg-white">
 <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
 <div className="flex items-center gap-2">
 <h2 className="text-base font-semibold">互动收件箱</h2>
 {counts.new > 0 && (
 <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
 {counts.new} 新
 </span>
 )}
 </div>
 <div className="flex items-center gap-2">
 <button
 onClick={onSync}
 disabled={syncing}
 className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"aria-label={syncing ?'同步中':'同步'}
 title={syncing ?'同步中':'同步'}
 >
 <ICON.refresh size={14} className={syncing ?'animate-spin':''} />
 </button>
 <button
 onClick={onClose}
 className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"aria-label="关闭"title="关闭">
 <ICON.close size={14} />
 </button>
 </div>
 </div>

 <div className="flex border-b border-zinc-200">
 {(['new','handled','all'] as const).map((t) => {
 const count =
 t ==='new'? counts.new : t ==='handled'? counts.handled : Object.values(counts).reduce((a, b) => a + b, 0);
 return (
 <button
 key={t}
 onClick={() => setTab(t)}
 className={`flex-1 px-4 py-2 text-sm transition ${
 tab === t
 ?'border-b-2 border-amber-400 font-medium text-zinc-900':'text-zinc-500 hover:text-zinc-800'}`}
 >
 {t ==='new'?'新回复': t ==='handled'?'已处理':'全部'} ({count})
 </button>
 );
 })}
 </div>

 {error && (
 <div className="m-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="flex-1 overflow-y-auto">
 {loading ? (
 <div className="p-6 text-center text-sm text-zinc-500">加载中…</div>
 ) : replies.length === 0 && xHandleLoaded && !xHandle ? (
 <div className="p-4">
 <XHandleSetup
 initial={xHandle}
 onSaved={(h) => {
 setXHandle(h);
 setError(null);
 }}
 />
 <div className="mt-3 text-center text-xs text-zinc-500">
 设置完点同步
 </div>
 </div>
 ) : replies.length === 0 ? (
 <div className="p-6 text-center text-sm text-zinc-500">
 {tab ==='new'?'没有新回复。点同步拉新':'没有数据'}
 </div>
 ) : (
 <div className="divide-y divide-zinc-100">
 {replies.map((r) => (
 <ReplyCard
 key={r.id}
 reply={r}
 expanded={expandedId === r.id}
 drafting={drafting[r.id] ==='drafting'}
 onExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
 onDraft={() => onDraft(r.id)}
 onAction={onAction}
 />
 ))}
 </div>
 )}
 </div>
 </div>
 );
}

function ReplyCard({
 reply,
 expanded,
 drafting,
 onExpand,
 onDraft,
 onAction,
}: {
 reply: Reply;
 expanded: boolean;
 drafting: boolean;
 onExpand: () => void;
 onDraft: () => void;
 onAction: (id: string, action:'mark_handled'|'mark_skipped') => void;
}) {
 const drafts = reply.draft_meta?.drafts ?? (reply.drafted_response ? [{ text: reply.drafted_response, strategy:'(已选)', why_this:''}] : []);

 return (
 <div className="px-4 py-3">
 <div className="mb-2 flex items-start gap-2">
 <div className="flex-1">
 <div className="flex items-center gap-2 text-xs text-zinc-500">
 <span>@{reply.reply_author_handle ??'unknown'}</span>
 <span>·</span>
 <span>{formatTime(reply.pulled_at)}</span>
 {reply.status !=='new'&& (
 <span className={`rounded px-1.5 py-0.5 text-xs ${
 reply.status ==='drafted'?'bg-blue-100 text-blue-700':
 reply.status ==='handled'?'bg-emerald-100 text-emerald-700':'bg-zinc-100 text-zinc-500'}`}>
 {reply.status ==='drafted'?'已起草': reply.status ==='handled'?'已处理':'已跳过'}
 </span>
 )}
 </div>
 <div className="mt-1 text-sm text-zinc-800">{reply.reply_text}</div>
 </div>
 </div>

 <details className="mb-2">
 <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">
 引用了你的推文
 </summary>
 <div className="mt-1 rounded bg-zinc-50 p-2 text-xs text-zinc-600">
 {reply.parent_tweet_text}
 </div>
 </details>

 {!expanded && (
 <div className="flex items-center gap-2">
 <button
 onClick={onDraft}
 disabled={drafting}
 className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-xs text-zinc-900 hover:bg-amber-500 disabled:opacity-50">
 <ICON.wand size={14} />
 {drafting ?'起草中…':'起草回复'}
 </button>
 {reply.drafted_response && (
 <button
 onClick={onExpand}
 className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs hover:bg-zinc-50">
 查看草稿
 </button>
 )}
 <button
 onClick={() => onAction(reply.id,'mark_handled')}
 className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
 <ICON.checkPlain size={14} />
 已处理
 </button>
 <button
 onClick={() => onAction(reply.id,'mark_skipped')}
 className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50">
 跳过
 </button>
 </div>
 )}

 {expanded && drafts.length > 0 && (
 <div className="mt-2 space-y-2">
 {drafts.map((d, i) => (
 <div
 key={i}
 className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
 <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
 <span>选项 {i + 1}</span>
 {d.strategy && <span className="rounded bg-zinc-200 px-1.5 py-0.5">{d.strategy}</span>}
 </div>
 <div className="whitespace-pre-wrap text-zinc-800">{d.text}</div>
 {d.why_this && (
 <div className="mt-1 text-xs text-zinc-500">{d.why_this}</div>
 )}
 <div className="mt-2 flex gap-2">
 <CopyButton text={d.text} />
 </div>
 </div>
 ))}
 <div className="flex gap-2">
 <button
 onClick={onDraft}
 disabled={drafting}
 className="inline-flex items-center gap-1 text-xs text-zinc-900 hover:text-zinc-900">
 <ICON.refresh size={14} />
 重新生成
 </button>
 <button
 onClick={() => onAction(reply.id,'mark_handled')}
 className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700">
 <ICON.checkPlain size={14} />
 标记已处理
 </button>
 </div>
 </div>
 )}
 </div>
 );
}

function CopyButton({ text }: { text: string }) {
 const [copied, setCopied] = useState(false);
 return (
 <button
 onClick={async () => {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 setTimeout(() => setCopied(false), 1500);
 }}
 className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-xs hover:bg-zinc-100"title={copied ?'已复制':'复制'}
 >
 <ICON.copy size={14} />
 {copied ?'已复制':'复制'}
 </button>
 );
}

function formatTime(s: string): string {
 const d = new Date(s);
 const now = Date.now();
 const diff = now - d.getTime();
 const min = Math.floor(diff / 60000);
 if (min < 1) return'刚刚';
 if (min < 60) return `${min} 分钟前`;
 const hr = Math.floor(min / 60);
 if (hr < 24) return `${hr} 小时前`;
 const day = Math.floor(hr / 24);
 if (day < 7) return `${day} 天前`;
 return d.toISOString().slice(0, 10);
}
