'use client';

import { useState } from'react';
import { useRouter } from'next/navigation';
import Link from'next/link';
import { ICON } from'@/lib/design';

export default function PathBPage() {
 const router = useRouter();
 const [handles, setHandles] = useState<string[]>(['','','']);
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const clean = handles.map((h) => h.replace(/^@/,'').trim()).filter(Boolean);

 const onExtract = async () => {
 if (clean.length === 0) {
 setError('至少填 1 个账号');
 return;
 }
 if (clean.length > 3) {
 setError('最多 3 个账号');
 return;
 }
 setSubmitting(true);
 setError(null);
 try {
 const r = await fetch('/api/voice-dna/extract-from-tweets', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ handles: clean, isOwnTweets: false }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 if (r.status === 409) {
 throw new Error(j.message ||'样本不足,试试模板或推荐');
 }
 if (r.status === 502) {
 throw new Error('X cookies 失效,先去配 cookie');
 }
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 router.push('/');
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 setSubmitting(false);
 }
 };

 return (
 <div className="min-h-screen bg-zinc-50">
 <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
 {/* 顶部:返回 + 进度 */}
 <div className="mb-6 flex items-center gap-3">
 <Link
 href="/onboarding"className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"aria-label="返回"title="返回">
 <ICON.arrowLeft size={18} />
 </Link>
 <div className="flex flex-1 items-center gap-1.5">
 <div className="h-1.5 flex-1 rounded-full bg-amber-400"/>
 <div className="h-1.5 flex-1 rounded-full bg-zinc-200"/>
 </div>
 </div>

 <h1 className="text-xl font-semibold text-zinc-900">
 粘 1-3 个对标账号
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 拉每人 25 条,合成你的 DNA。
 </p>

 <div className="mt-6 space-y-3">
 {handles.map((h, i) => (
 <div key={i} className="flex items-center gap-3">
 <span className="w-12 text-right text-xs text-zinc-400">#{i + 1}</span>
 <input
 type="text"value={h}
 onChange={(e) => {
 const next = [...handles];
 next[i] = e.target.value;
 setHandles(next);
 }}
 placeholder="@username"className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-amber-400 focus:outline-none"/>
 </div>
 ))}
 </div>

 {error && (
 <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="mt-6 flex justify-end">
 <button
 onClick={onExtract}
 disabled={submitting || clean.length === 0}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 <ICON.wand size={14} />
 {submitting ?'提取中…': `提取${clean.length > 0 ? ` (${clean.length})` :''}`}
 </button>
 </div>

 <div className="mt-8 border-t border-zinc-200 pt-6 text-center">
 <div className="text-xs text-zinc-500">
 不知道对标谁?
 </div>
 <Link
 href="/onboarding/path-b/recommend"className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:text-zinc-900">
 让我帮你推荐
 <ICON.arrowRight size={14} />
 </Link>
 </div>
 </div>
 </div>
 );
}
