'use client';

import { useState } from'react';
import { useRouter } from'next/navigation';
import Link from'next/link';
import { ICON } from'@/lib/design';

/**
 * Path A: 我有内容
 * - 默认 = X 账号 输入(最高频入口)
 * - 次级 ="粘自己的文字"链接(博客/Newsletter/邮件,不需要 cookies)
 */
export default function PathAPage() {
 const router = useRouter();
 const [handle, setHandle] = useState('');
 const [extracting, setExtracting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const onExtract = async () => {
 const clean = handle.replace(/^@/,'').trim();
 if (!clean) {
 setError('填一个 X 账号');
 return;
 }
 setExtracting(true);
 setError(null);
 try {
 const r = await fetch('/api/voice-dna/extract-from-tweets', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ handles: [clean], isOwnTweets: true }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 if (r.status === 409) {
 throw new Error(
 j.message ||'样本不足(账号新或全是 RT/reply)。试试粘文字或选模板。',
 );
 }
 if (r.status === 502) {
 throw new Error('X cookies 失效。先粘文字或选模板。');
 }
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 router.push('/');
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 setExtracting(false);
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
 粘你的 X 账号
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 拉最近 25 条原创推文,提取你的风格。
 </p>

 <div className="mt-6">
 <input
 type="text"value={handle}
 onChange={(e) => setHandle(e.target.value)}
 placeholder="@your_handle"className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-4 text-base focus:border-amber-400 focus:outline-none"onKeyDown={(e) => {
 if (e.key ==='Enter') onExtract();
 }}
 autoFocus
 />
 </div>

 {error && (
 <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="mt-4 text-xs text-zinc-400">
 需要 X cookies 配好;没有的话,试试下面的"粘文字"。
 </div>

 <div className="mt-6 flex justify-end">
 <button
 onClick={onExtract}
 disabled={extracting || !handle.trim()}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 <ICON.wand size={14} />
 {extracting ?'提取中…':'提取'}
 </button>
 </div>

 {/* 次级入口:粘文字 */}
 <div className="mt-8 border-t border-zinc-200 pt-6 text-center">
 <div className="text-xs text-zinc-500">
 没有 X cookies?没账号?或者想用博客/Newsletter?
 </div>
 <Link
 href="/onboarding/path-a/paste"className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:text-zinc-900">
 粘我自己的文字
 <ICON.arrowRight size={14} />
 </Link>
 <div className="mt-1 text-xs text-zinc-400">
 博客、Newsletter、邮件、推文都行,不需要 X cookies
 </div>
 </div>
 </div>
 </div>
 );
}
