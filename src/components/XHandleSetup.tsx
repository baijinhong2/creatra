'use client';

import { useState } from'react';
import { ICON } from'@/lib/design';

/**
 * Inline x_handle setup form.
 * Used in places that need x_handle (Path A, InboxPanel, Health) so user
 * doesn't have to navigate away to set it.
 *
 * Props:
 * - onSaved(handle): called after successful save
 * - initial: pre-fill value (optional)
 * - compact: smaller padding for drawer / sidebar usage
 */
export function XHandleSetup({
 onSaved,
 initial,
 compact = false,
}: {
 onSaved?: (handle: string) => void;
 initial?: string | null;
 compact?: boolean;
}) {
 const [value, setValue] = useState(initial ??'');
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const onSave = async () => {
 const cleaned = value.replace(/^@/,'').trim();
 if (!cleaned) {
 setError('填你的 X 账号');
 return;
 }
 setSaving(true);
 setError(null);
 try {
 const r = await fetch('/api/account/x-handle', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ x_handle: cleaned }),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 throw new Error(j.error || `HTTP ${r.status}`);
 }
 onSaved?.(cleaned);
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setSaving(false);
 }
 };

 if (compact) {
 return (
 <div className="flex items-center gap-2">
 <input
 type="text"value={value}
 onChange={(e) => setValue(e.target.value)}
 placeholder="@your_handle"className="h-7 flex-1 rounded border border-zinc-200 bg-white px-2 text-xs focus:border-amber-400 focus:outline-none"onKeyDown={(e) => {
 if (e.key ==='Enter') onSave();
 }}
 />
 <button
 onClick={onSave}
 disabled={saving || !value.trim()}
 className="rounded bg-amber-400 px-2 py-1 text-xs text-zinc-900 hover:bg-amber-500 disabled:opacity-50">
 {saving ?'...':'保存'}
 </button>
 {error && <span className="text-xs text-red-500">{error}</span>}
 </div>
 );
 }

 return (
 <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
 <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-900">
 <ICON.warn size={14} />
 <span>需要先设置你的 X 账号</span>
 </div>
 <div className="text-xs text-amber-500/80">
 用 cookie 模式拉数据,先填你的 X 账号。
 </div>
 <div className="mt-2 flex items-center gap-2">
 <input
 type="text"value={value}
 onChange={(e) => setValue(e.target.value)}
 placeholder="@your_handle"className="h-9 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-amber-400 focus:outline-none"onKeyDown={(e) => {
 if (e.key ==='Enter') onSave();
 }}
 autoFocus
 />
 <button
 onClick={onSave}
 disabled={saving || !value.trim()}
 className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-amber-500 disabled:opacity-50">
 {saving ?'保存中…':'保存'}
 </button>
 </div>
 {error && (
 <div className="mt-2 text-xs text-red-500">{error}</div>
 )}
 </div>
 );
}
