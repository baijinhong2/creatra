'use client';

import { useEffect, useState } from'react';

export function InboxBadge({ onClick }: { onClick: () => void }) {
 const [count, setCount] = useState(0);
 const [loading, setLoading] = useState(false);

 const load = async () => {
 try {
 const r = await fetch('/api/replies?status=new&limit=1');
 if (!r.ok) return;
 const j = await r.json();
 setCount(j.counts?.new ?? 0);
 } catch {}
 };

 useEffect(() => {
 load();
 const t = setInterval(load, 60_000);
 return () => clearInterval(t);
 }, []);

 return (
 <button
 onClick={onClick}
 className="relative flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100"title="互动收件箱">
 <svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round">
 <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
 </svg>
 <span>互动</span>
 {count > 0 && (
 <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
 {count > 99 ?'99+': count}
 </span>
 )}
 </button>
 );
}
