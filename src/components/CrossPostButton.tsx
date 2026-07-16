'use client';

import { useState } from'react';
import { ICON, type IconName } from'@/lib/design';

type Platform ='jike'|'xiaohongshu'|'linkedin';

type Rewrite = {
 platform: Platform;
 text: string;
 style_notes: string;
 char_count: number;
 hashtags: string[] | null;
 source_attribution: string | null;
};

const PLATFORMS: Array<{ id: Platform; name: string; icon: IconName; charLimit: number }> = [
 { id:'jike', name:'即刻', icon:'messageCircle', charLimit: 1000 },
 { id:'xiaohongshu', name:'小红书', icon:'book', charLimit: 1000 },
 { id:'linkedin', name:'LinkedIn', icon:'briefcase', charLimit: 3000 },
];

export function CrossPostButton({ text }: { text: string }) {
 const [open, setOpen] = useState(false);
 const [selected, setSelected] = useState<Platform[]>(['jike','xiaohongshu','linkedin']);
 const [loading, setLoading] = useState(false);
 const [rewrites, setRewrites] = useState<Rewrite[]>([]);
 const [error, setError] = useState<string | null>(null);
 const [copied, setCopied] = useState<Record<number, boolean>>({});

 const onOpen = () => {
 setOpen(true);
 if (rewrites.length === 0) {
 onRewrite();
 }
 };

 const onRewrite = async () => {
 if (selected.length === 0) return;
 setLoading(true);
 setError(null);
 try {
 const r = await fetch('/api/cross-post/rewrite', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 source_tweet: text,
 source_url: null,
 platforms: selected,
 }),
 });
 const j = await r.json();
 if (!r.ok) throw new Error(j.error || j.message);
 setRewrites(j.rewrites);
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setLoading(false);
 }
 };

 const onCopy = async (idx: number, txt: string) => {
 await navigator.clipboard.writeText(txt);
 setCopied({ ...copied, [idx]: true });
 setTimeout(() => setCopied({ ...copied, [idx]: false }), 1500);
 };

 return (
 <>
 <button
 onClick={onOpen}
 className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"title="改写到其他平台">
 <ICON.share size={14} strokeWidth={2.5} />
 <span>跨平台</span>
 </button>

 {open && (
 <div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"onClick={() => setOpen(false)}
 >
 <div
 className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"onClick={(e) => e.stopPropagation()}
 >
 <div className="mb-3 flex items-center justify-between">
 <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold">
 <ICON.share size={18} />
 改写到其他平台
 </h2>
 <button
 onClick={() => setOpen(false)}
 className="rounded p-1 text-zinc-400 hover:bg-zinc-100"aria-label="关闭"title="关闭">
 <ICON.close size={14} />
 </button>
 </div>

 <div className="mb-3 flex flex-wrap gap-2 text-xs">
 {PLATFORMS.map((p) => {
 const PlatformIcon = ICON[p.icon];
 return (
 <label
 key={p.id}
 className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 transition ${
 selected.includes(p.id)
 ?'bg-amber-400 text-zinc-900':'bg-zinc-100 text-zinc-600'}`}
 >
 <input
 type="checkbox"checked={selected.includes(p.id)}
 onChange={(e) => {
 if (e.target.checked) {
 setSelected([...selected, p.id]);
 } else {
 setSelected(selected.filter((s) => s !== p.id));
 }
 }}
 className="hidden"/>
 <PlatformIcon size={14} />
 {p.name}
 </label>
 );
 })}
 <button
 onClick={onRewrite}
 disabled={loading || selected.length === 0}
 className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-zinc-900 hover:bg-zinc-700 disabled:opacity-50">
 <ICON.refresh size={14} className={loading ?'animate-spin':''} />
 {loading ?'改写中…':'重新生成'}
 </button>
 </div>

 {error && (
 <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="space-y-3">
 {loading && rewrites.length === 0 && (
 <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 p-4 text-center text-sm text-zinc-500">
 <ICON.wand size={14} className="animate-pulse"/>
 正在用声音 DNA 改写…
 </div>
 )}
 {rewrites.map((r, i) => {
 const meta = PLATFORMS.find((p) => p.id === r.platform)!;
 const MetaIcon = ICON[meta.icon];
 return (
 <div
 key={i}
 className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
 <div className="mb-2 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <MetaIcon size={14} />
 <span className="text-sm font-medium">{meta.name}</span>
 <span className="text-xs text-zinc-400">
 {r.char_count} / {meta.charLimit} 字符
 </span>
 </div>
 <button
 onClick={() => onCopy(i, r.text + (r.hashtags ?'\n\n'+ r.hashtags.map((h) =>'#'+ h).join('') :''))}
 className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs hover:bg-zinc-50"title={copied[i] ?'已复制':'复制'}
 >
 <ICON.copy size={14} />
 {copied[i] ?'已复制':'复制'}
 </button>
 </div>
 {r.style_notes && (
 <div className="mb-2 text-xs text-zinc-500">
 {r.style_notes}
 </div>
 )}
 <div className="whitespace-pre-wrap rounded bg-white p-2 text-sm">
 {r.text}
 </div>
 {r.hashtags && r.hashtags.length > 0 && (
 <div className="mt-2 text-xs text-blue-600">
 {r.hashtags.map((h) =>'#'+ h).join('')}
 </div>
 )}
 {r.source_attribution && (
 <div className="mt-1 text-xs text-zinc-400">
 {r.source_attribution}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 </div>
 )}
 </>
 );
}
