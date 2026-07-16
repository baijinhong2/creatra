'use client';

import { useEffect, useState } from'react';
import { useRouter } from'next/navigation';
import { ICON } from'@/lib/design';

type Rec = {
 main: {
 topic: string;
 angle: string;
 draft: string;
 reasoning: {
 why_this_topic: string;
 why_this_angle: string;
 voice_dna_match: string;
 outcomes_evidence: string;
 };
 best_time: { start: string; end: string; tz: string };
 };
 alternatives: Array<{
 topic: string;
 angle: string;
 draft: string;
 score: number;
 }>;
 trends: Array<{ topic: string; status: string; momentum: number }>;
 no_significant_trend: boolean;
 source_date: string;
};

export function TopicsPage() {
 const router = useRouter();
 const [rec, setRec] = useState<Rec | null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [showAlts, setShowAlts] = useState(false);
 const [tab, setTab] = useState<'today'|'history'>('today');
 const [history, setHistory] = useState<Rec[]>([]);
 const [copied, setCopied] = useState(false);

 const load = async () => {
 setLoading(true);
 setError(null);
 try {
 const r = await fetch('/api/topics/today');
 const j = await r.json();
 if (j.result) {
 setRec(j.result);
 } else {
 // No cache — generate
 await generate(false);
 }
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setLoading(false);
 }
 };

 const generate = async (force: boolean) => {
 setLoading(true);
 setError(null);
 try {
 const r = await fetch('/api/topics/recommend', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ force }),
 });
 const j = await r.json();
 if (!r.ok) throw new Error(j.error || j.message);
 setRec(j);
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 load();
 }, []);

 const onCopy = async (text: string) => {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 setTimeout(() => setCopied(false), 1500);
 };

 return (
 <div className="min-h-screen bg-zinc-50">
 <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
 <div className="mb-4 flex items-center gap-3">
 <button
 onClick={() => router.push('/')}
 className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-700">
 <ICON.arrowLeft size={14} />
 返回
 </button>
 <h1 className="inline-flex items-center gap-1.5 text-xl font-semibold">
 <ICON.bulb size={18} />
 今日选题
 </h1>
 <div className="flex-1"/>
 <button
 onClick={() => generate(true)}
 disabled={loading}
 className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50">
 <ICON.refresh size={14} className={loading ?'animate-spin':''} />
 {loading ?'生成中…':'重新生成'}
 </button>
 </div>

 {error && (
 <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 {loading && !rec && (
 <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
 <ICON.wand size={14} className="animate-pulse"/>
 正在扫描热点、写作风格、历史表现…
 </div>
 )}

 {rec && (
 <div className="space-y-4">
 {/* Date + trends */}
 <div className="flex items-center gap-2 text-xs text-zinc-500">
 <span className="inline-flex items-center gap-1">
 <ICON.calendar size={14} />
 {rec.source_date}
 </span>
 {rec.trends.length > 0 && (
 <div className="flex flex-wrap gap-1.5">
 {rec.trends.map((t, i) => {
 const TrendIcon = t.status ==='rising'? ICON.trendUp : t.status ==='cooling'? ICON.trendDown : t.status ==='peaked'? ICON.trendFlat : ICON.sparkle;
 return (
 <span
 key={i}
 className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs ${
 t.status ==='rising'?'bg-emerald-100 text-emerald-700':
 t.status ==='cooling'?'bg-orange-100 text-orange-700':
 t.status ==='peaked'?'bg-zinc-100 text-zinc-600':'bg-blue-100 text-blue-700'}`}
 >
 <TrendIcon size={14} />
 {t.topic}
 </span>
 );
 })}
 </div>
 )}
 </div>

 {rec.no_significant_trend && (
 <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
 今天没明显新热点,推荐发你账号最有效的"复盘类"内容。
 </div>
 )}

 {/* Main recommendation */}
 <div className="rounded-xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
 <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-900">
 主推
 </div>
 <h2 className="mb-1 text-lg font-semibold text-zinc-900">
 {rec.main.topic}
 </h2>
 <div className="mb-3 text-sm text-zinc-500">
 角度: {rec.main.angle}
 </div>

 <div className="mb-3 rounded-lg bg-zinc-50 p-3">
 <div className="mb-1 text-xs uppercase tracking-wider text-zinc-400">草稿</div>
 <div className="whitespace-pre-wrap text-sm text-zinc-800">
 {rec.main.draft}
 </div>
 </div>

 <details className="mb-3">
 <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700">
 为什么推荐
 </summary>
 <div className="mt-2 space-y-1 text-xs text-zinc-600">
 <div>• {rec.main.reasoning.why_this_topic}</div>
 <div>• {rec.main.reasoning.why_this_angle}</div>
 <div>• {rec.main.reasoning.voice_dna_match}</div>
 <div>• {rec.main.reasoning.outcomes_evidence}</div>
 {rec.main.best_time && (
 <div>• 最佳时段: {rec.main.best_time.start}-{rec.main.best_time.end} {rec.main.best_time.tz}</div>
 )}
 </div>
 </details>

 <div className="flex flex-wrap items-center gap-2">
 <button
 onClick={() => onCopy(rec.main.draft)}
 className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-amber-500">
 <ICON.copy size={14} />
 {copied ?'已复制':'复制主推'}
 </button>
 <button
 onClick={() => generate(true)}
 className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50">
 <ICON.refresh size={14} />
 换一条
 </button>
 </div>
 </div>

 {/* Alternatives */}
 {rec.alternatives.length > 0 && (
 <div>
 <button
 onClick={() => setShowAlts(!showAlts)}
 className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700">
 {showAlts ?'收起':'展开'} {rec.alternatives.length} 个备选
 {showAlts ? <ICON.chevUp size={14} /> : <ICON.chevDown size={14} />}
 </button>
 {showAlts && (
 <div className="mt-3 space-y-3">
 {rec.alternatives.map((alt, i) => (
 <div
 key={i}
 className="rounded-lg border border-zinc-200 bg-white p-4">
 <div className="mb-1 flex items-center gap-2">
 <span className="text-xs uppercase tracking-wider text-zinc-400">
 备选 {i + 1}
 </span>
 <span className="text-xs text-zinc-500">
 匹配度 {(alt.score * 100).toFixed(0)}%
 </span>
 </div>
 <div className="font-medium text-zinc-900">{alt.topic}</div>
 <div className="mb-2 text-xs text-zinc-500">{alt.angle}</div>
 <div className="mb-2 rounded bg-zinc-50 p-2 text-sm">
 {alt.draft}
 </div>
 <button
 onClick={() => onCopy(alt.draft)}
 className="inline-flex items-center gap-1 text-xs text-zinc-900 hover:text-zinc-900">
 <ICON.copy size={14} />
 复制
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 );
}

export default function TopicsPageRoute() {
 return <TopicsPage />;
}
