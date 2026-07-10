'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Combined /login and /register page.
 *
 * Mode is toggled by a button. We don't redirect to a separate /register
 * route — keeping it one page keeps the code and the user experience simple.
 * Server-side: posts to /api/auth/login or /api/auth/register.
 */
export default function AuthPage() {
  return (
    <Suspense fallback={<AuthShell mode="login" />}>
      <AuthInner />
    </Suspense>
  );
}

function AuthShell({ mode }: { mode: 'login' | 'register' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl font-bold shadow-lg shadow-violet-500/20">
            V
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            viralpost
          </h1>
          <p className="text-center text-xs text-zinc-500">
            {mode === 'login' ? '登录你的账号' : '创建账号,开始用'}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center text-xs text-zinc-500">
          加载中…
        </div>
      </div>
    </div>
  );
}

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' && displayName ? { display_name: displayName } : {}),
        }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl font-bold shadow-lg shadow-violet-500/20">
            V
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            viralpost
          </h1>
          <p className="text-center text-xs text-zinc-500">
            {mode === 'login' ? '登录你的账号' : '创建账号,开始用'}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
        >
          {mode === 'register' && (
            <div>
              <label className="block text-xs text-zinc-400">昵称(可选)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="随便起个名字"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
                autoComplete="nickname"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
          >
            {busy
              ? '处理中…'
              : mode === 'login'
                ? '登录'
                : '注册并登录'}
          </button>

          <div className="text-center text-xs text-zinc-500">
            {mode === 'login' ? '没账号?' : '已经有账号了?'}{' '}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode(mode === 'login' ? 'register' : 'login');
              }}
              className="text-violet-400 hover:text-violet-300"
            >
              {mode === 'login' ? '注册一个' : '去登录'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-[10px] text-zinc-600">
          你的对话历史、偏好、X cookie 都按账号隔离。
        </p>
      </div>
    </div>
  );
}
