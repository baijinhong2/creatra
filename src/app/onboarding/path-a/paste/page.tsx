'use client';

import { useState } from'react';
import { useRouter } from'next/navigation';
import Link from'next/link';
import { ICON } from'@/lib/design';

const SOURCE_OPTIONS = [
 { id:'tweet', label:'X 推文'},
 { id:'blog', label:'博客'},
 { id:'newsletter', label:'Newsletter'},
 { id:'email', label:'邮件'},
 { id:'other', label:'其他'},
];

const MIN_CHARS = 200;
const MAX_CHARS = 5000;

export default function PastePage() {
 const router = useRouter();
 const [text, setText] = useState('');
 const [sources, setSources] = useState<string[]>(['tweet','blog']);
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const charCount = text.length;
 const valid = charCount >= MIN_CHARS && charCount <= MAX_CHARS && sources.length > 0;

 const toggleSource = (id: string) => {
 if (sources.includes(id)) {
 setSources(sources.filter((s) => s !== id));
 } else {
 setSources([...sources, id]);
 }
 };

 const onSubmit = async () => {
 if (!valid) return;
 setSubmitting(true);
 setError(null);
 try {
 const r = await fetch('/api/voice-dna/extract-from-text', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ text, source_types: sources }),
 });
 const j = await r.json();
 if (!r.ok) {
 throw new Error(j.message || j.error || `HTTP ${r.status}`);
 }
 router.push('/');
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <div className="min-h-screen bg-zinc-50">
 <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
 {/* 顶部:返回 + 进度 */}
 <div className="mb-6 flex items-center gap-3">
 <Link
 href="/onboarding/path-a"className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"aria-label="返回"title="返回">
 <ICON.arrowLeft size={18} />
 </Link>
 <div className="flex flex-1 items-center gap-1.5">
 <div className="h-1.5 flex-1 rounded-full bg-amber-400"/>
 <div className="h-1.5 flex-1 rounded-full bg-zinc-200"/>
 </div>
 </div>

 <h1 className="text-xl font-semibold text-zinc-900">
 粘你自己的内容
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 粘 5-10 段你写过的内容(短+长混合)。
 </p>

 <div className="mt-5">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 内容来源(可多选)
 </div>
 <div className="flex flex-wrap gap-2">
 {SOURCE_OPTIONS.map((s) => (
 <button
 key={s.id}
 type="button"onClick={() => toggleSource(s.id)}
 className={`rounded-full px-3 py-1 text-xs transition ${
 sources.includes(s.id)
 ?'bg-amber-400 text-zinc-900':'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
 >
 {s.label}
 </button>
 ))}
 </div>
 </div>

 <div className="mt-4">
 <div className="mb-2 flex items-center justify-between text-xs">
 <span className="font-medium text-zinc-700">
 粘贴你的内容
 </span>
 <span
 className={`tabular-nums ${
 charCount < MIN_CHARS || charCount > MAX_CHARS
 ?'text-red-500':'text-emerald-600'}`}
 >
 {charCount} / {MAX_CHARS},至少 {MIN_CHARS}
 </span>
 </div>
 <textarea
 value={text}
 onChange={(e) => setText(e.target.value)}
 rows={14}
 placeholder="在这里粘贴你的内容(博客 / Newsletter / 邮件开头 / 推文都行)"className="w-full resize-y rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-6 focus:border-amber-400 focus:outline-none"/>
 </div>

 {error && (
 <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="mt-6 flex justify-end">
 <button
 onClick={onSubmit}
 disabled={!valid || submitting}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 <ICON.wand size={14} />
 {submitting ?'提取中…':'提取'}
 </button>
 </div>
 </div>
 </div>
 );
}
