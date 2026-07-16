'use client';

import { useEffect, useState } from'react';
import { useRouter } from'next/navigation';
import { XHandleSetup } from'@/components/XHandleSetup';
import { ICON } from'@/lib/design';

type Report = {
 week: string;
 week_start: string;
 week_end: string;
 generated_at: string;
 metrics: {
 tweets_published: number;
 avg_engagement: number;
 best_time_slot: { day: string; hour_range: string; multiplier: number } | null;
 best_type: { type: string; avg_engagement: number; count: number } | null;
 worst_type: { type: string; avg_engagement: number; count: number } | null;
 };
 outcomes_summary: string;
 recommendations: string[];
};

export default function HealthPageRoute() {
 const router = useRouter();
 const [report, setReport] = useState<Report | null>(null);
 const [history, setHistory] = useState<Report[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [xHandle, setXHandle] = useState<string | null>(null);
 const [xHandleLoaded, setXHandleLoaded] = useState(false);

 const load = async () => {
 try {
 const r = await fetch('/api/health/generate');
 const j = await r.json();
 if (j.report) setReport(j.report);
 } catch {}
 try {
 const r = await fetch('/api/health/history');
 const j = await r.json();
 setHistory(j.reports ?? []);
 } catch {}
 };

 // Load x_handle
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

 useEffect(() => {
 if (xHandleLoaded && xHandle) load();
 }, [xHandle, xHandleLoaded]);

 const onGenerate = async () => {
 if (!xHandle) {
 setError('先设置 X 账号');
 return;
 }
 setLoading(true);
 setError(null);
 try {
 const r = await fetch('/api/health/generate', { method:'POST'});
 const j = await r.json();
 if (!r.ok) throw new Error(j.message || j.error);
 setReport(j.report);
 load();
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setLoading(false);
 }
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
 <ICON.barChart size={18} />
 账号健康
 </h1>
 <div className="flex-1"/>
 <button
 onClick={onGenerate}
 disabled={loading || !xHandle}
 className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-amber-500 disabled:opacity-50">
 <ICON.refresh size={14} className={loading ?'animate-spin':''} />
 {loading ?'生成中…':'重新生成'}
 </button>
 </div>

 {error && (
 <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 {/* Inline x_handle setup if not set */}
 {xHandleLoaded && !xHandle && (
 <div className="mb-4">
 <XHandleSetup
 onSaved={(h) => {
 setXHandle(h);
 setError(null);
 }}
 />
 </div>
 )}

 {!report && !loading && xHandle && (
 <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
 还没有周报。点"重新生成"拉数据。
 </div>
 )}

 {report && (
 <div className="space-y-4">
 <div className="rounded-xl border border-zinc-200 bg-white p-5">
 <div className="inline-flex items-center gap-1 text-xs text-zinc-500">
 <ICON.calendar size={14} />
 <span>{report.week_start} ~ {report.week_end}</span>
 </div>

 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
 <Metric label="原创推文"value={String(report.metrics.tweets_published)} />
 <Metric label="平均互动"value={report.metrics.avg_engagement.toFixed(1)} />
 {report.metrics.best_time_slot && (
 <Metric
 label="最佳时段"value={`${report.metrics.best_time_slot.day} ${report.metrics.best_time_slot.hour_range}`}
 sub={`比平均高 ${report.metrics.best_time_slot.multiplier.toFixed(1)} 倍`}
 />
 )}
 {report.metrics.best_type && (
 <Metric
 label="最佳类型"value={report.metrics.best_type.type}
 sub={`互动 ${report.metrics.best_type.avg_engagement.toFixed(1)} · ${report.metrics.best_type.count} 条`}
 />
 )}
 </div>

 {report.outcomes_summary && (
 <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
 <div className="mb-1 text-xs uppercase tracking-wider text-zinc-400">
 总结
 </div>
 {report.outcomes_summary}
 </div>
 )}

 {report.recommendations.length > 0 && (
 <div className="mt-4">
 <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">
 建议
 </div>
 <ul className="space-y-1.5 text-sm text-zinc-700">
 {report.recommendations.map((r, i) => (
 <li key={i} className="flex gap-2">
 <span className="text-zinc-400">{i + 1}.</span>
 <span>{r}</span>
 </li>
 ))}
 </ul>
 </div>
 )}
 </div>

 {history.length > 1 && (
 <div>
 <h2 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
 历史
 </h2>
 <div className="space-y-2">
 {history.slice(1).map((h, i) => (
 <div
 key={i}
 className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
 <div className="mb-1 font-medium text-zinc-700">
 {h.week_start} ~ {h.week_end}
 </div>
 <div className="text-zinc-500">
 {h.metrics.tweets_published} 条推文 · 平均互动{''}
 {h.metrics.avg_engagement.toFixed(1)}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
 return (
 <div className="rounded-lg bg-zinc-50 p-3">
 <div className="text-xs uppercase tracking-wider text-zinc-400">{label}</div>
 <div className="mt-1 text-lg font-semibold text-zinc-900">
 {value}
 </div>
 {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
 </div>
 );
}
