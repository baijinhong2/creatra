'use client';

import { useState, useCallback, useRef, useEffect } from'react';
import { ICON } from'@/lib/design';

type Status ='idle'|'creating'|'awaiting_url'|'saving_url'|'tracking'|'failed';

export function UsedTweetButton({
 text,
 conversationId,
 messageId,
}: {
 text: string;
 conversationId: string | null;
 messageId: string;
}) {
 const [status, setStatus] = useState<Status>('idle');
 const [userTweetId, setUserTweetId] = useState<string | null>(null);
 const [url, setUrl] = useState('');
 const [error, setError] = useState<string | null>(null);
 const inputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 if (status ==='awaiting_url') {
 setTimeout(() => inputRef.current?.focus(), 50);
 }
 }, [status]);

 const onMark = useCallback(async () => {
 setStatus('creating');
 setError(null);
 try {
 const r = await fetch('/api/user-tweets', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 tweet_text: text,
 source:'agent_draft',
 draft_session_id: conversationId,
 draft_message_id: messageId,
 }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 const j = await r.json();
 setUserTweetId(j.user_tweet.id);
 setStatus('awaiting_url');
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 setStatus('failed');
 }
 }, [text, conversationId, messageId]);

 const onSaveUrl = useCallback(async () => {
 if (!userTweetId) return;
 if (!/^https?:\/\/(www\.)?(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(url)) {
 setError('URL 格式: x.com/username/status/123');
 return;
 }
 setStatus('saving_url');
 setError(null);
 try {
 const r = await fetch(`/api/user-tweets/${userTweetId}`, {
 method:'PATCH',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ action:'paste_url', tweet_url: url }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 setStatus('tracking');
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 setStatus('failed');
 }
 }, [userTweetId, url]);

 const onSkip = useCallback(() => {
 setStatus('idle');
 setUserTweetId(null);
 setUrl('');
 }, []);

 // Idle state: small"用了这条"link
 if (status ==='idle'|| status ==='creating'|| status ==='failed') {
 return (
 <span className="inline-flex items-center gap-1">
 <button
 type="button"onClick={onMark}
 disabled={status ==='creating'}
 className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"aria-label="用了这条"title="标记'用了这条',我可以跟踪效果">
 {status ==='creating'? (
 <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-400 border-t-transparent"/>
 ) : (
 <ICON.checkPlain size={14} strokeWidth={2.5} />
 )}
 <span>用了这条</span>
 </button>
 {error && <span className="text-xs text-red-500">{error}</span>}
 </span>
 );
 }

 // Awaiting URL: small inline popover
 if (status ==='awaiting_url'|| status ==='saving_url') {
 return (
 <span className="inline-flex items-center gap-1.5">
 <input
 ref={inputRef}
 type="url"value={url}
 onChange={(e) => setUrl(e.target.value)}
 onKeyDown={(e) => {
 if (e.key ==='Enter') onSaveUrl();
 if (e.key ==='Escape') onSkip();
 }}
 placeholder="x.com/.../status/123"disabled={status ==='saving_url'}
 className="h-6 w-56 rounded border border-zinc-200 bg-white px-1.5 text-xs text-zinc-700 focus:border-amber-400 focus:outline-none"/>
 <button
 type="button"onClick={onSaveUrl}
 disabled={status ==='saving_url'|| !url}
 className="inline-flex h-6 items-center gap-1 rounded bg-amber-400 px-2 text-xs text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 <ICON.save size={14} />
 {status ==='saving_url'?'…':'保存'}
 </button>
 <button
 type="button"onClick={onSkip}
 className="inline-flex h-6 items-center rounded px-1.5 text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700">
 以后再说
 </button>
 {error && <span className="text-xs text-red-500">{error}</span>}
 </span>
 );
 }

 // Tracking state
 return (
 <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
 <ICON.checkPlain size={14} strokeWidth={2.5} />
 <span>已标记 · 跟踪中</span>
 </span>
 );
}
