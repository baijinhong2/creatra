'use client';

import {
 createContext,
 useContext,
 useState,
 useCallback,
 useEffect,
 type ReactNode,
} from'react';

export type AuthUser = {
 id: string;
 email: string;
 display_name: string | null;
};

type AuthState =
 | { status:'loading'}
 | { status:'ready'; user: AuthUser | null };

type AuthModalContextValue = {
 /** auth check has finished (loading skeleton can be hidden) */
 authReady: boolean;
 /** current user — null in guest mode */
 user: AuthUser | null;
 /** imperative setter used by LoginModal (after login/register) and logout handlers */
 setUser: (u: AuthUser | null) => void;

 // modal control
 open: boolean;
 mode:'login'|'register';
 openLogin: () => void;
 openRegister: () => void;
 close: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

/**
 * 全局 auth + login modal 的唯一来源。
 *
 * - 启动时拉一次 `/api/auth/me` 决定初始 user
 * - 登录 / 注册成功后由 LoginModal 调 `setUser(data.user)` 立即更新
 * - 登出时 page.tsx 调 `setUser(null)` 切回 guest 模式
 *
 * 任何子组件都可以用 `useAuth()` 拿当前 user,不需要各自重新 fetch。
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
 const [auth, setAuth] = useState<AuthState>({ status:'loading'});
 const [open, setOpen] = useState(false);
 const [mode, setMode] = useState<'login'|'register'>('login');

 // 启动时 fetch 一次
 useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const r = await fetch('/api/auth/me', { cache:'no-store'});
 if (!r.ok) {
 if (!cancelled) setAuth({ status:'ready', user: null });
 return;
 }
 const data = (await r.json()) as { user: AuthUser | null };
 if (!cancelled) setAuth({ status:'ready', user: data.user ?? null });
 } catch {
 if (!cancelled) setAuth({ status:'ready', user: null });
 }
 })();
 return () => { cancelled = true; };
 }, []);

 const setUser = useCallback((u: AuthUser | null) => {
 setAuth({ status:'ready', user: u });
 }, []);

 const openLogin = useCallback(() => {
 setMode('login');
 setOpen(true);
 }, []);
 const openRegister = useCallback(() => {
 setMode('register');
 setOpen(true);
 }, []);
 const close = useCallback(() => setOpen(false), []);

 return (
 <AuthModalContext.Provider
 value={{
 authReady: auth.status ==='ready',
 user: auth.status ==='ready'? auth.user : null,
 setUser,
 open,
 mode,
 openLogin,
 openRegister,
 close,
 }}
 >
 {children}
 </AuthModalContext.Provider>
 );
}

export function useAuthModal(): AuthModalContextValue {
 const ctx = useContext(AuthModalContext);
 if (!ctx) {
 throw new Error('useAuthModal must be used inside AuthModalProvider');
 }
 return ctx;
}
