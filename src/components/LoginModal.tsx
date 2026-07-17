'use client';

import { useState, FormEvent, useEffect } from'react';
import { useAuthModal, type AuthUser } from'./AuthModalProvider';
import { ICON } from'@/lib/design';

export function LoginModal() {
 const { open, mode, close, openRegister, setUser } = useAuthModal();
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [displayName, setDisplayName] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // 重置表单
 useEffect(() => {
 if (!open) {
 setError(null);
 setBusy(false);
 }
 }, [open]);

 // ESC 关闭
 useEffect(() => {
 if (!open) return;
 const onKey = (e: KeyboardEvent) => {
 if (e.key ==='Escape'&& !busy) close();
 };
 document.addEventListener('keydown', onKey);
 return () => document.removeEventListener('keydown', onKey);
 }, [open, busy, close]);

 if (!open) return null;

 const submit = async (e: FormEvent) => {
 e.preventDefault();
 setError(null);
 setBusy(true);
 try {
 const url = mode ==='login'?'/api/auth/login':'/api/auth/register';
 const r = await fetch(url, {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 email,
 password,
 ...(mode ==='register'&& displayName ? { display_name: displayName } : {}),
 }),
 });
 if (!r.ok) {
 const data = (await r.json().catch(() => ({}))) as { error?: string };
 throw new Error(data.error ?? `HTTP ${r.status}`);
 }
 // 登录 / 注册成功:API 直接返回 user,直接 push 到 context,
 // 所有订阅 user 的组件(主页、sidebar、OnboardingGate...)立即重渲染
 const data = (await r.json()) as { user: AuthUser };
 setUser(data.user);
 close();
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 } finally {
 setBusy(false);
 }
 };

 return (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"onClick={() => !busy && close()}
 >
 <div
 className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl"onClick={(e) => e.stopPropagation()}
 >
 {/* Header */}
 <div className="mb-5 flex items-center justify-between">
 <div className="flex items-center gap-2.5">
  <img
  src="/creatra-logo-256.png"
  alt="creatra"
  width={40}
  height={40}
  className="h-10 w-10 shrink-0 rounded-lg"
  />
 <div>
 <div className="text-sm font-semibold text-zinc-900">creatra</div>
 <div className="text-xs text-zinc-500">
 {mode ==='login'?'登录你的社交运营顾问':'创建账号,开始用'}
 </div>
 </div>
 </div>
 <button
 onClick={() => !busy && close()}
 disabled={busy}
 className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"aria-label="关闭"title="关闭">
 <ICON.close size={16} />
 </button>
 </div>

 <form onSubmit={submit} className="space-y-3">
 {mode ==='register'&& (
 <div>
 <label className="mb-1 block text-xs text-zinc-600">昵称(可选)</label>
 <input
 type="text"value={displayName}
 onChange={(e) => setDisplayName(e.target.value)}
 placeholder="随便起个名字"className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"autoComplete="nickname"/>
 </div>
 )}
 <div>
 <label className="mb-1 block text-xs text-zinc-600">邮箱</label>
 <input
 type="email"value={email}
 onChange={(e) => setEmail(e.target.value)}
 placeholder="you@example.com"required
 autoComplete="email"className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"/>
 </div>
 <div>
 <label className="mb-1 block text-xs text-zinc-600">密码</label>
 <input
 type="password"value={password}
 onChange={(e) => setPassword(e.target.value)}
 placeholder="至少 6 位"required
 minLength={6}
 autoComplete={mode ==='login'?'current-password':'new-password'}
 className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"/>
 </div>

 {error && (
 <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <button
 type="submit"disabled={busy}
 className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 {busy ? (
 <>
 <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent"/>
 处理中…
 </>
 ) : mode ==='login'?'登录':'注册并登录'}
 </button>

 <div className="text-center text-xs text-zinc-500">
 {mode ==='login'?'没账号?':'已经有账号了?'}{''}
 <button
 type="button"onClick={() => {
 setError(null);
 if (mode ==='login') openRegister();
 else close();
 // 重新打开为 login mode
 if (mode ==='register') close();
 }}
 disabled={busy}
 className="text-amber-500 transition hover:text-amber-600 disabled:opacity-50">
 {mode ==='login'?'注册一个':'去登录'}
 </button>
 </div>
 </form>
 </div>
 </div>
 );
}
