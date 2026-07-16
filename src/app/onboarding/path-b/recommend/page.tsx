'use client';

import { useState } from'react';
import { useRouter } from'next/navigation';
import Link from'next/link';
import { ICON, type IconName } from'@/lib/design';

type Option = { v: string; label: string; icon?: IconName };

const QUIZ: Array<{ id: string; label: string; options: Option[] }> = [
 {
 id:'direction',
 label:'你想看什么方向的内容?',
 options: [
 { v:'saas', label:'独立开发 / SaaS', icon:'hammer'},
 { v:'ai', label:'AI / 人工智能', icon:'bot'},
 { v:'tools', label:'开发者工具', icon:'settings'},
 { v:'content_creation', label:'内容创作 / 设计', icon:'palette'},
 ],
 },
 {
 id:'style',
 label:'你欣赏什么风格?',
 options: [
 { v:'casual', label:'不端着 / 聊得来', icon:'briefcase'},
 { v:'professional', label:'干具体 / 商务感', icon:'briefcase'},
 { v:'humorous', label:'幽默 / 段子手', icon:'smile'},
 ],
 },
 {
 id:'language',
 label:'主要语言?',
 options: [
 { v:'en', label:'英文'},
 { v:'zh', label:'中文'},
 ],
 },
];

export default function PathBRecommendPage() {
 const router = useRouter();
 const [step, setStep] = useState(0);
 const [answers, setAnswers] = useState<Record<string, string>>({});
 const [recommendations, setRecommendations] = useState<Array<{ handle: string; reason: string }>>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [selected, setSelected] = useState<string[]>([]);

 const onAnswer = (qid: string, v: string) => {
 setAnswers({ ...answers, [qid]: v });
 };

 const onNext = async () => {
 if (step < QUIZ.length - 1) {
 setStep(step + 1);
 return;
 }
 setLoading(true);
 setError(null);
 try {
 const r = await fetch('/api/voice-dna/recommend-creators', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 direction: answers.direction,
 style: answers.style,
 language: answers.language,
 }),
 });
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 const j = await r.json();
 setRecommendations(j.recommendations ?? []);
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setLoading(false);
 }
 };

 const onExtract = async () => {
 if (selected.length === 0) {
 setError('至少选 1 个');
 return;
 }
 setLoading(true);
 setError(null);
 try {
 const r = await fetch('/api/voice-dna/extract-from-tweets', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ handles: selected, isOwnTweets: false }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 if (r.status === 409) {
 throw new Error(j.message ||'样本不足');
 }
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 router.push('/');
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 setLoading(false);
 }
 };

 const currentQ = QUIZ[step];

 return (
 <div className="min-h-screen bg-zinc-50">
 <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
 {/* 顶部:返回 + 进度 */}
 <div className="mb-6 flex items-center gap-3">
 {step > 0 && recommendations.length === 0 ? (
 <button
 onClick={() => setStep(step - 1)}
 className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"aria-label="上一步"title="上一步">
 <ICON.arrowLeft size={18} />
 </button>
 ) : (
 <Link
 href="/onboarding/path-b"className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"aria-label="返回"title="返回">
 <ICON.arrowLeft size={18} />
 </Link>
 )}
 <div className="flex flex-1 items-center gap-1.5">
 <div
 className={`h-1.5 flex-1 rounded-full ${
 step >= 0 ?'bg-amber-400':'bg-zinc-200'}`}
 />
 <div
 className={`h-1.5 flex-1 rounded-full ${
 step >= 1 || recommendations.length > 0
 ?'bg-amber-400':'bg-zinc-200'}`}
 />
 </div>
 </div>

 <h1 className="text-xl font-semibold text-zinc-900">
 让我推荐对标
 </h1>

 {recommendations.length === 0 && (
 <div className="mt-6 space-y-4">
 <div className="text-sm text-zinc-700">
 {currentQ.label}
 </div>
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 {currentQ.options.map((opt) => {
 const OptIcon = opt.icon ? ICON[opt.icon] : null;
 return (
 <button
 key={opt.v}
 onClick={() => onAnswer(currentQ.id, opt.v)}
 className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
 answers[currentQ.id] === opt.v
 ?'border-amber-400 bg-zinc-50':'border-zinc-200 bg-white hover:border-zinc-300'}`}
 >
 {OptIcon && <OptIcon size={20} className="text-zinc-500"/>}
 <span className="text-sm">{opt.label}</span>
 </button>
 );
 })}
 </div>

 {error && (
 <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="flex justify-end">
 <button
 onClick={onNext}
 disabled={!answers[currentQ.id] || loading}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 {loading ? ('找对标中…') : step < QUIZ.length - 1 ? (
 <>
 下一步
 <ICON.arrowRight size={14} />
 </>
 ) : (
 <>
 推荐
 <ICON.arrowRight size={14} />
 </>
 )}
 </button>
 </div>
 </div>
 )}

 {recommendations.length > 0 && (
 <div className="mt-6 space-y-3">
 <div className="text-sm text-zinc-700">
 选 1-3 个,我拉他们的推文合成你的 DNA:
 </div>
 {recommendations.map((r) => (
 <label
 key={r.handle}
 className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
 selected.includes(r.handle)
 ?'border-amber-400 bg-zinc-50':'border-zinc-200 bg-white hover:border-zinc-300'}`}
 >
 <input
 type="checkbox"checked={selected.includes(r.handle)}
 onChange={(e) => {
 if (e.target.checked) {
 setSelected([...selected, r.handle].slice(0, 3));
 } else {
 setSelected(selected.filter((s) => s !== r.handle));
 }
 }}
 className="mt-1"/>
 <div className="flex-1">
 <div className="font-medium text-zinc-900">
 {r.handle}
 </div>
 <div className="text-xs text-zinc-500">
 {r.reason}
 </div>
 </div>
 </label>
 ))}

 {error && (
 <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="flex items-center justify-between">
 <button
 onClick={() => {
 setRecommendations([]);
 setStep(0);
 setSelected([]);
 }}
 className="inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-900">
 <ICON.refresh size={14} />
 重做
 </button>
 <button
 onClick={onExtract}
 disabled={selected.length === 0 || loading}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 <ICON.wand size={14} />
 {loading ?'提取中…': `提取 (${selected.length} 个)`}
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 );
}
