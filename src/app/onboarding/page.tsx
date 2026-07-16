'use client';

import { useEffect, useState } from'react';
import { useRouter } from'next/navigation';
import Link from'next/link';
import { ICON, type IconName } from'@/lib/design';

const PATHS: Array<{
 id: string;
 title: string;
 subtitle: string;
 time: string;
 href: string;
 icon: IconName;
 recommended?: boolean;
}> = [
 {
 id:'a',
 title:'我有内容',
 subtitle:'从推文、博客、Newsletter 提取',
 time:'~10-30 秒',
 href:'/onboarding/path-a',
 icon:'target',
 },
 {
 id:'template',
 title:'直接选模板',
 subtitle:'5 个写作模板,选 1 个就走',
 time:'~30 秒',
 href:'/onboarding/template',
 icon:'dna',
 recommended: true,
 },
 {
 id:'b',
 title:'我想用某博主的风格',
 subtitle:'粘 1-3 个对标账号',
 time:'~1-2 分钟',
 href:'/onboarding/path-b',
 icon:'clipboard',
 },
 {
 id:'c',
 title:'从 0 开始 / 聊聊自己',
 subtitle:'AI 跟我聊聊,帮我找出声音',
 time:'~5-10 分钟',
 href:'/onboarding/path-c',
 icon:'sparkle',
 },
];

export default function OnboardingPage() {
 const router = useRouter();
 const [hasDna, setHasDna] = useState<boolean | null>(null);
 const [dna, setDna] = useState<any>(null);

 useEffect(() => {
 (async () => {
 try {
 const r = await fetch('/api/voice-dna');
 if (!r.ok) return;
 const j = await r.json();
 setHasDna(j.has_dna);
 setDna(j.dna);
 } catch {}
 })();
 }, []);

 return (
 <div className="min-h-screen bg-zinc-50">
 <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
 <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
 Onboarding
 </div>
 <h1 className="mb-2 text-2xl font-semibold text-zinc-900">
 先认识你的写作风格
 </h1>
 <p className="mb-8 text-sm text-zinc-600">
 让我学你说话,之后推文更像你写的。
 </p>

 {hasDna && dna && (
 <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
 <div className="mb-1 inline-flex items-center gap-1.5 font-medium text-emerald-900">
 <ICON.check size={14} />
 你已经设置过声音 DNA
 </div>
 <div className="text-emerald-700/80">
 来源: {dna.source_type} · 置信度 {(dna.confidence * 100).toFixed(0)}% · version{''}
 {dna.version}
 </div>
 <div className="mt-3 flex gap-2">
 <button
 onClick={() => router.push('/')}
 className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700">
 进入主界面
 <ICON.arrowRight size={14} />
 </button>
 <button
 onClick={async () => {
 await fetch('/api/voice-dna', {
 method:'PATCH',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ action:'mark_outdated'}),
 });
 setHasDna(false);
 setDna(null);
 }}
 className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100">
 重新设置
 </button>
 </div>
 </div>
 )}

 <div className="space-y-3">
 {PATHS.map((p) => (
 <Link
 key={p.id}
 href={p.href}
 className="group relative flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-md">
 {'recommended'in p && p.recommended && (
 <span className="absolute -right-2 -top-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-medium text-zinc-900 shadow">
 推荐
 </span>
 )}
 <div className="text-3xl text-zinc-400 group-hover:text-zinc-900">
 {(() => {
 const Icon = ICON[p.icon];
 return <Icon size={28} />;
 })()}
 </div>
 <div className="flex-1">
 <div className="font-medium text-zinc-900 group-hover:text-zinc-900">
 {p.title}
 </div>
 <div className="text-xs text-zinc-500">
 {p.subtitle}
 </div>
 </div>
 <div className="flex flex-col items-end gap-1 text-xs text-zinc-400">
 <span className="rounded-full bg-zinc-100 px-2 py-0.5">
 {p.time}
 </span>
 <ICON.arrowRight size={14} />
 </div>
 </Link>
 ))}
 </div>

 <div className="mt-8 text-center text-xs text-zinc-400">
 <Link
 href="/"className="inline-flex items-center gap-1 hover:text-zinc-700">
 <ICON.close size={14} />
 跳过,稍后设置
 </Link>
 </div>
 </div>
 </div>
 );
}
