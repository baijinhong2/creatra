'use client';

import { useState } from'react';
import { useRouter } from'next/navigation';
import Link from'next/link';
import {
 listVoiceTemplates,
 type VoiceTemplateId,
 CONTENT_LABELS,
 HOOK_LABELS,
 TONE_LABELS,
} from'@/lib/voiceTemplates';
import { ICON } from'@/lib/design';

export default function PathBTemplatePage() {
 const router = useRouter();
 const [expanded, setExpanded] = useState<VoiceTemplateId | null>(null);
 const [saving, setSaving] = useState<VoiceTemplateId | null>(null);
 const [error, setError] = useState<string | null>(null);
 const templates = listVoiceTemplates();

 const onSelect = async (id: VoiceTemplateId) => {
 setSaving(id);
 setError(null);
 try {
 const r = await fetch('/api/voice-dna/extract-from-quiz', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 quiz_answers: {
 sentence_length:'short',
 emoji_rate:'never',
 question_rate:'medium',
 formality:'casual',
 story_focus:'no',
 },
 compare_choices: [id, id],
 freeform: null,
 }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 router.push('/');
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 setSaving(null);
 }
 };

 return (
 <div className="min-h-screen bg-zinc-50">
 <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
 {/* 顶部:返回 + 进度 */}
 <div className="mb-6 flex items-center gap-3">
 <Link
 href="/onboarding"className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"aria-label="返回"title="返回">
 <ICON.arrowLeft size={18} />
 </Link>
 <div className="flex flex-1 items-center gap-1.5">
 <div className="h-1.5 flex-1 rounded-full bg-amber-400"/>
 <div className="h-1.5 flex-1 rounded-full bg-amber-400"/>
 </div>
 </div>

 <h1 className="text-xl font-semibold text-zinc-900">
 选一个写作模板
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 每个模板 3 个轴各占 1 个位置。
 </p>

 <div className="mt-6 space-y-3">
 {templates.map((t) => (
 <div
 key={t.id}
 className="rounded-xl border border-zinc-200 bg-white p-4">
 <div className="flex items-start gap-3">
 <div className="flex-1">
 <div className="font-medium text-zinc-900">
 {t.name}
 </div>
 <div className="mt-1 text-sm text-zinc-600">
 {t.tagline}
 </div>
 <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
 <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
 内容: {CONTENT_LABELS[t.axes.content] ?? t.axes.content}
 </span>
 <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
 钩子: {HOOK_LABELS[t.axes.hook] ?? t.axes.hook}
 </span>
 <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
 语气: {TONE_LABELS[t.axes.tone] ?? t.axes.tone}
 </span>
 </div>
 </div>
 <div className="flex flex-col items-end gap-1.5">
 <button
 type="button"onClick={() => setExpanded(expanded === t.id ? null : t.id)}
 className="inline-flex items-center gap-1 text-xs text-zinc-900 hover:text-zinc-900">
 {expanded === t.id ?'收起':'查看样例'}
 <ICON.chevDown
 size={14}
 className={`transition ${expanded === t.id ?'rotate-180':''}`}
 />
 </button>
 <button
 type="button"onClick={() => onSelect(t.id)}
 disabled={saving !== null}
 className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 {saving === t.id ? ('保存中…') : (
 <>
 <ICON.checkPlain size={14} />
 选这个
 </>
 )}
 </button>
 </div>
 </div>

 {expanded === t.id && (
 <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
 {t.sampleTweets.map((tw, i) => (
 <div
 key={i}
 className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
 <div className="mb-1 text-xs uppercase tracking-wider text-zinc-400">
 样例 {i + 1}
 </div>
 <div className="whitespace-pre-wrap">{tw}</div>
 </div>
 ))}
 </div>
 )}
 </div>
 ))}
 </div>

 {error && (
 <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}
 </div>
 </div>
 );
}
