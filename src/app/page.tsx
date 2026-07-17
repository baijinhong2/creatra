'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from'react';
import {
  t,
  TOOL_TRACE_STORAGE_KEY,
  type DictKey,
} from'@/lib/i18n';
import {
 MODELS,
 DEFAULT_MODEL,
 MODEL_STORAGE_KEY,
 type ModelId,
 getModel,
} from'@/lib/models';
import ReactMarkdown from'react-markdown';
import remarkGfm from'remark-gfm';
import remarkBreaks from'remark-breaks';
import Link from'next/link';
import { UsedTweetButton } from'@/components/UsedTweetButton';
// OnboardingGate removed — sidebar nav's "声音 DNA" item links to /onboarding directly.
import { InboxBadge } from'@/components/InboxBadge';
import { InboxPanel } from'@/components/InboxPanel';
import { CrossPostButton } from'@/components/CrossPostButton';
import { useAuthModal } from'@/components/AuthModalProvider';
import { ICON, type IconName } from'@/lib/design';

// ─── Types ─────────────────────────────────────────────────────────────

type Attachment = {
 url: string;
 mime: string;
 size: number;
 name?: string;
 kind?:'image'|'text'|'pdf'|'other';
 ext?: string;
};

type DisplayMessage = {
 id: string;
 role:'user'|'assistant';
 content: string;
 attachments?: Attachment[];
 createdAt?: number; // epoch ms — used for the per-message timestamp footer
};

type ToolCallDisplay = {
 id: string;
 name: string;
 args: Record<string, unknown>;
 result?: unknown;
 ok?: boolean;
 error?: string;
 status:'running'|'done'|'error';
 startedAt: number;
 endedAt?: number;
};

type AgentEvent =
 | { type:'conversation_assigned'; conversationId: string }
 | { type:'message_start'}
 | { type:'message_delta'; content: string }
 | { type:'message_end'; content: string }
 | { type:'mode_decided'; mode:'expert'|'assistant'}
 | {
 type:'tool_start';
 toolCallId: string;
 name: string;
 args: Record<string, unknown>;
 }
 | {
 type:'tool_end';
 toolCallId: string;
 name: string;
 ok: boolean;
 result: unknown;
 error?: string;
 }
 | { type:'error'; message: string }
 | { type:'done'};

const CONV_KEY ='vp_conversation_id';

// 9 skill entry points (1:1 with the system prompt's skill catalog)
// + 2 general-purpose"tools"(web search / image search).
// Order: skills 1-9, then 2 general.
// 11 个能力入口 — 顺序按"用户最常用"排,top 3 默认展开,其余收起
const SUGGESTED_PROMPT_KEYS: { title: DictKey; body: DictKey }[] = [
 { title:'prompt.daily.title', body:'prompt.daily.body'}, // 1. 今天发什么
 { title:'prompt.brand.title', body:'prompt.brand.body'}, // 2. 取名 + bio
 { title:'prompt.creators.title', body:'prompt.creators.body'}, // 3. 找对标博主
 { title:'prompt.replies.title', body:'prompt.replies.body'}, // 4. 看评论 / 写回复
 { title:'prompt.engage.title', body:'prompt.engage.body'}, // 5. 竞品互动
 { title:'prompt.positioning.title',body:'prompt.positioning.body'},// 6. 从 0 定位账号
 { title:'prompt.strategy.title', body:'prompt.strategy.body'}, // 7. 内容更新策略
 { title:'prompt.analytics.title', body:'prompt.analytics.body'}, // 8. 我的数据
 { title:'prompt.insights.title', body:'prompt.insights.body'}, // 9. 沉淀 / 反思
 { title:'prompt.searchNews.title', body:'prompt.searchNews.body'}, // 10. 搜全网热点
 { title:'prompt.findImage.title', body:'prompt.findImage.body'}, // 11. 找配图
];
const TOP_PROMPTS_COUNT = 3;

// ─────────────────────────────────────────────────────────────────────
// Sidebar (ChatGPT-style: minimal + collapsible sources + user pill at bottom)
// ─────────────────────────────────────────────────────────────────────

type ConversationSummary = {
 id: string;
 title: string;
 mode:'auto'|'expert'|'assistant';
 created_at: string;
 updated_at: string;
 message_count: number;
};

type Preference = {
 key: string;
 value: unknown;
 is_secret: boolean;
 has_value: boolean;
 updated_at: string;
 // Phase 1 lifecycle fields (only present when fetch uses ?include=meta)
 scope?: string;
 confidence?: number;
 last_used_at?: string | null;
 last_confirmed_at?: string;
};

type Source = {
 prefKey: string;
 label: DictKey;
 placeholder: string;
 hint: DictKey;
};

const SOURCES: Source[] = [
 {
 prefKey:'github.token',
 label:'source.github.label',
 placeholder:'ghp_xxx or gho_xxx',
 hint:'source.github.hint',
 },
 {
 prefKey:'x.auth_token',
 label:'source.xAuth.label',
 placeholder:'auth_token cookie value',
 hint:'source.xAuth.hint',
 },
 {
 prefKey:'x.ct0',
 label:'source.xCt0.label',
 placeholder:'ct0 cookie value',
 hint:'source.xCt0.hint',
 },
];

function timeAgo(iso: string): string {
 const t1 = new Date(iso).getTime();
 const diff = Date.now() - t1;
 const min = Math.floor(diff / 60000);
 if (min < 1) return t('meta.justNow');
 if (min < 60) return `${min} 分钟前`;
 const hr = Math.floor(min / 60);
 if (hr < 24) return `${hr} 小时前`;
 const d = Math.floor(hr / 24);
 if (d < 7) return `${d} 天前`;
 return new Date(iso).toLocaleDateString();
}

function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
  currentUser,
  onLogout,
  narrow,
  showToolTrace,
  setShowToolTrace,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  currentUser: { id: string; email: string; display_name: string | null } | null;
  onLogout: () => void;
  narrow: boolean;
  showToolTrace: boolean;
  setShowToolTrace: (v: boolean) => void;
}) {
 const { openLogin } = useAuthModal();
 const [openPanel, setOpenPanel] = useState<null |'sources'|'insights'|'memories'>(null);

 // Inline sidebar colors (no Tailwind) — keeps the colors consistent
 // dark-mode compositing bug where descendants render as the aside's bg.
 const sidebarBg = '#fafafa';
 const sidebarText = '#18181b';
 const sidebarBorder = '#e4e4e7';

 return (
 <aside
 className="flex h-full w-full flex-col"style={{ backgroundColor: sidebarBg, color: sidebarText }}
 >
 {/* Brand row + collapse toggle */}
 <div className="flex items-center justify-between gap-2 px-3 pt-3">
  <div className="flex items-center gap-2.5 px-1.5">
  <img
  src="/creatra-logo-256.png"
  alt="creatra"
  width={32}
  height={32}
  className="h-8 w-8 shrink-0 rounded-lg"
  />
  {!narrow && (
  <span
  className="text-[17px] font-semibold tracking-tight text-zinc-900"
  style={{ fontFeatureSettings: '"ss01"' }}
  >
  creatra
  </span>
  )}
 </div>
 <button
 onClick={onClose}
 className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700"aria-label="Collapse sidebar"title="Collapse sidebar">
 <svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="M11 19l-7-7 7-7M21 19l-7-7 7-7"/>
 </svg>
 </button>
 </div>

 {/* New chat */}
 <div className="px-3 pt-3">
 <button
 onClick={onNew}
 title={t('sidebar.newChat')}
 className={`flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 ${narrow ?'justify-center px-0':''}`}
 >
 <svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.2"strokeLinecap="round">
 <path d="M12 5v14M5 12h14"/>
 </svg>
 {!narrow && t('sidebar.newChat')}
 </button>
 </div>

 {/* Recent chats */}
 <div className="mt-5 flex flex-1 flex-col overflow-hidden px-1.5">
 {!narrow && (
 <h3 className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
 {t('sidebar.recent')}
 </h3>
 )}
 <div className="flex-1 overflow-y-auto pb-2">
 {conversations.length === 0 ? (
 !narrow && (
 <p className="px-3 py-2 text-xs text-zinc-400">
 {t('sidebar.emptyChats')}
 </p>
 )
 ) : (
 <div className="flex flex-col gap-0.5">
 {conversations.map((c) => {
 const isActive = c.id === activeId;
 return (
 <button
 key={c.id}
 onClick={() => onSelect(c.id)}
 title={c.title || ('无标题')}
 className={`group ${narrow ?'flex items-center justify-center px-0 py-2':'flex flex-col items-start gap-0.5 px-3 py-2'} rounded-lg text-left text-sm transition ${
 isActive
 ?'bg-zinc-200/70 text-zinc-900':'text-zinc-600 hover:bg-zinc-200/40'}`}
 >
 {narrow ? (
 <svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
 </svg>
 ) : (
 <>
 <div className="line-clamp-1 w-full">{c.title || ('无标题')}</div>
 <div className="text-xs text-zinc-400">
  {timeAgo(c.updated_at)}
 </div>
 </>
 )}
 </button>
 );
 })}
 </div>
 )}
 </div>
 </div>

 {/* Library buttons — 3 panels (insights / memories / sources), each
 opens as a modal overlay. Only one open at a time. */}
 <div className="border-t border-zinc-200 px-1.5 py-2">
 <LinkButton
 href="/topics"label="今日选题"narrow={narrow}
 icon="flame"/>
 <LinkButton
 href="/health"label="账号健康"narrow={narrow}
 icon="barChart"/>
 <LinkButton
 href="/onboarding"label="声音 DNA"narrow={narrow}
 icon="dna"/>
 <LibraryButton
 narrow={narrow}
 label={t('sidebar.insights')}
 icon={<ICON.star size={14} />}
 active={openPanel ==='insights'}
 onClick={() => setOpenPanel(openPanel ==='insights'? null :'insights')}
 />
 <LibraryButton
 narrow={narrow}
 label={t('sidebar.memories')}
 icon={<ICON.brain size={14} />}
 active={openPanel ==='memories'}
 onClick={() => setOpenPanel(openPanel ==='memories'? null :'memories')}
 />
 <LibraryButton
 narrow={narrow}
 label={t('sidebar.sources')}
 icon={<ICON.database size={14} />}
 active={openPanel ==='sources'}
 onClick={() => setOpenPanel(openPanel ==='sources'? null :'sources')}
 />
 </div>

 {/* User pill — at the very bottom of the sidebar (ChatGPT pattern).
 Guest users see a"登录"button instead of the avatar pill. */}
  {!narrow && (
  <div className="border-t border-zinc-200 px-1.5 py-2">
  {currentUser ? (
  <UserMenu
  user={currentUser}
  showToolTrace={showToolTrace}
  setShowToolTrace={setShowToolTrace}
  onLogout={onLogout}
  />
  ) : (
 <button
 onClick={openLogin}
 className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500"title="登录">
 <ICON.logout size={14} className="rotate-180"/>
 登录
 </button>
 )}
 </div>
 )}
 {narrow && (
  <div className="border-t border-zinc-200 px-1.5 py-2">
  {currentUser ? (
  <UserMenu
  user={currentUser}
  showToolTrace={showToolTrace}
  setShowToolTrace={setShowToolTrace}
  onLogout={onLogout}
  compact
  />
  ) : (
 <button
 onClick={openLogin}
 className="flex h-10 w-full items-center justify-center rounded-lg bg-amber-400 text-zinc-900 transition hover:bg-amber-500"title="登录"aria-label="登录">
 <ICON.logout size={14} className="rotate-180"/>
 </button>
 )}
 </div>
 )}

 {/* Library modal (insights / memories / sources) */}
 <LibraryModal
 open={openPanel !== null}
 onClose={() => setOpenPanel(null)}
 title={
  openPanel ==='insights'? t('insights.title')
  : openPanel ==='memories'? t('memories.title')
  : t('sidebar.sources')
  }
  >
  {openPanel ==='insights'&& <InsightsPanel />}
  {openPanel ==='memories'&& <MemoriesPanel />}
  {openPanel ==='sources'&& <SourcesPanel />}
  </LibraryModal>
 </aside>
 );
}

// ─────────────────────────────────────────────────────────────────────
// Library nav buttons + icons (sidebar bottom section)
// ─────────────────────────────────────────────────────────────────────

function LibraryButton({
  narrow,
  label,
  icon,
  active,
  onClick,
}: {
  narrow: boolean;
 label: string;
 icon: React.ReactNode;
 active: boolean;
 onClick: () => void;
}) {
 return (
 <button
 onClick={onClick}
 title={label}
 className={`flex w-full items-center ${narrow ?'justify-center px-0':'gap-2'} rounded-lg px-3 py-1.5 text-xs transition ${
 active
 ?'bg-zinc-200/70 text-zinc-900':'text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900'}`}
 >
 {icon}
 {!narrow && <span className="flex-1 text-left">{label}</span>}
 </button>
 );
}

function LinkButton({
 href,
 label,
 narrow,
 icon,
}: {
 narrow: boolean;
 label: string;
 icon: IconName;
 href: string;
}) {
 const IconComp = ICON[icon];
 return (
 <a
 href={href}
 title={label}
 className={`flex w-full items-center ${narrow ?'justify-center px-0':'gap-2'} rounded-lg px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-200/40 hover:text-zinc-900 `}
 >
 <IconComp size={14} />
 {!narrow && <span className="flex-1 text-left">{label}</span>}
 </a>
 );
}

function InsightsIcon() {
 return <ICON.star size={14} />;
}

function MemoryIcon() {
 return <ICON.brain size={14} />;
}

function SourcesIcon() {
 return <ICON.database size={14} />;
}

// ─────────────────────────────────────────────────────────────────────
// Sources panel (sub-component — used inside the modal)
// ─────────────────────────────────────────────────────────────────────

function SourcesPanel() {
 const [prefs, setPrefs] = useState<Preference[]>([]);
 const [loading, setLoading] = useState(false);
 const [editingKey, setEditingKey] = useState<string | null>(null);
 const [editingValue, setEditingValue] = useState('');
 const [savingKey, setSavingKey] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const r = await fetch('/api/preferences', { cache:'no-store'});
 if (r.ok) {
 const data = (await r.json()) as { preferences: Preference[] };
 setPrefs(data.preferences ?? []);
 }
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 const save = async (key: string, value: string) => {
 setSavingKey(key);
 try {
 const r = await fetch('/api/preferences', {
 method:'PUT',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ key, value }),
 });
 if (r.ok) {
 setEditingKey(null);
 setEditingValue('');
 await load();
 }
 } finally {
 setSavingKey(null);
 }
 };

 const forget = async (key: string) => {
 if (!confirm(t('source.confirmForget', { key }))) return;
 setSavingKey(key);
 try {
 await fetch(`/api/preferences?key=${encodeURIComponent(key)}`, {
 method:'DELETE',
 });
 await load();
 } finally {
 setSavingKey(null);
 }
 };

 if (loading) {
 return (
 <div className="py-2 text-center text-xs text-zinc-400">
 {t('source.statusMsg.loading')}
 </div>
 );
 }

 const prefMap = new Map<string, Preference>(prefs.map((p) => [p.key, p]));

 return (
 <div className="space-y-2">
 {SOURCES.map((src) => {
 const pref = prefMap.get(src.prefKey);
 const isSet = pref?.has_value ?? false;
 const isEditing = editingKey === src.prefKey;
 const isSaving = savingKey === src.prefKey;
 return (
 <div key={src.prefKey} className="rounded-lg border border-zinc-200 bg-white p-2">
 <div className="mb-1 flex items-center justify-between">
 <span className="text-xs font-medium text-zinc-700">
 {t(src.label)}
 </span>
 <span
 className={`text-xs ${
 isSet ?'text-emerald-600':'text-zinc-400'}`}
 >
 {isSet ? t('source.status.set') : t('source.status.unset')}
 </span>
 </div>
 {isEditing ? (
 <div className="flex gap-1">
 <input
 type="password"value={editingValue}
 onChange={(e) => setEditingValue(e.target.value)}
 placeholder={src.placeholder}
 className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"autoFocus
 />
 <button
 onClick={() => save(src.prefKey, editingValue)}
 disabled={isSaving || !editingValue}
 className="rounded bg-amber-400 px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-amber-500 disabled:opacity-40">
 {isSaving ?'…': t('source.btn.save')}
 </button>
 </div>
 ) : (
 <div className="flex gap-1">
 <code className="flex-1 truncate rounded border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-500">
 {isSet ? src.prefKey : t('source.empty', { key: src.prefKey })}
 </code>
 <button
 onClick={() => {
 setEditingKey(src.prefKey);
 setEditingValue('');
 }}
 className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
 {isSet ? t('source.btn.replace') : t('source.btn.add')}
 </button>
 {isSet && (
 <button
 onClick={() => forget(src.prefKey)}
 className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500 hover:bg-red-100 hover:text-red-700">
 {t('source.btn.forget')}
 </button>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 );
}

// ─────────────────────────────────────────────────────────────────────
// Insights panel (沉淀 library — list, view, copy, download, delete)
// ─────────────────────────────────────────────────────────────────────

type Insight = {
 id: string;
 user_id: string;
 kind: string;
 title: string;
 body: string;
 tags: string[] | null;
 source_conversation_id: string | null;
 metadata: unknown;
 created_at: string;
};

const KIND_LABELS: Record<string, string> = {
 reflection:'insights.kind.reflection',
 project_breakdown:'insights.kind.project_breakdown',
 method:'insights.kind.method',
 discovery:'insights.kind.discovery',
 sharing:'insights.kind.sharing',
 fragment:'insights.kind.fragment',
};

function InsightsPanel() {
 const [insights, setInsights] = useState<Insight[]>([]);
 const [loading, setLoading] = useState(false);
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [copiedId, setCopiedId] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const r = await fetch('/api/insights?limit=200', { cache:'no-store'});
 if (r.ok) {
 const data = (await r.json()) as { insights: Insight[] };
 setInsights(data.insights ?? []);
 }
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 const remove = async (id: string) => {
 if (!confirm(t('insights.confirmDelete'))) return;
 try {
 const r = await fetch(`/api/insights/${id}`, { method:'DELETE'});
 if (r.ok) await load();
 } catch {
 // ignore
 }
 };

 const copy = async (it: Insight) => {
 const text = `${it.title}\n\n${it.body}${it.tags?.length ? `\n\n#${it.tags.join('#')}` :''}`;
 try {
 await navigator.clipboard.writeText(text);
 setCopiedId(it.id);
 setTimeout(() => setCopiedId(null), 1500);
 } catch {
 // ignore
 }
 };

 const downloadOne = (it: Insight) => {
 const md = `# ${it.title}\n\n_Kind: ${it.kind}_\n_Date: ${it.created_at}_\n${it.tags?.length ? `\nTags: ${it.tags.map((t) => `#${t}`).join('')}\n` :''}\n---\n\n${it.body}\n`;
 const blob = new Blob([md], { type:'text/markdown;charset=utf-8'});
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${t('insights.exportFilename')}-${it.id.slice(0, 8)}.md`;
 a.click();
 URL.revokeObjectURL(url);
 };

 const downloadAll = () => {
 if (insights.length === 0) return;
 const header = `# ${t('insights.title')} — ${insights.length} 条\n_导出时间: ${new Date().toISOString()}_\n\n---\n\n`;
 const body = insights
 .map(
 (it) =>
 `## ${it.title}\n\n**Kind:** ${it.kind} · **Date:** ${it.created_at}${it.tags?.length ? ` · **Tags:** ${it.tags.map((t) => `#${t}`).join('')}` :''}\n\n${it.body}\n`,
 )
 .join('\n---\n\n');
 const blob = new Blob([header + body], { type:'text/markdown;charset=utf-8'});
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${t('insights.exportFilename')}-${new Date().toISOString().slice(0, 10)}.md`;
 a.click();
 URL.revokeObjectURL(url);
 };

 // Inline-styled colors to dodge the chromium dark-mode compositing bug.
 const cardBg = '#ffffff';
 const cardBorder = '#e4e4e7';
 const muted = '#71717a';
 const codeBg = '#f4f4f5';

 return (
 <div>
 <div className="mb-3 flex items-center justify-between">
 <div className="text-xs text-zinc-500">
 {loading
 ? t('source.statusMsg.loading')
 : insights.length === 0
 ?'': `${insights.length} 条`}
 </div>
 {insights.length > 0 && (
 <button
 onClick={downloadAll}
 className="rounded bg-amber-400 px-2.5 py-1 text-xs font-medium text-zinc-900 hover:bg-amber-500">
 ⬇ {t('insights.btn.deleteAll')}
 </button>
 )}
 </div>

 {insights.length === 0 && !loading && (
 <div
 style={{
 padding:'24px 16px',
 textAlign:'center',
 color: muted,
 fontSize:'12px',
 border: `1px dashed ${cardBorder}`,
 borderRadius:'8px',
 backgroundColor: codeBg,
 }}
 >
 {t('insights.empty')}
 </div>
 )}

 <div className="space-y-2">
 {insights.map((it) => {
 const expanded = expandedId === it.id;
 const kindKey = KIND_LABELS[it.kind];
 return (
 <div
 key={it.id}
 style={{
 border: `1px solid ${cardBorder}`,
 borderRadius:'8px',
 backgroundColor: cardBg,
 padding:'10px 12px',
 }}
 >
 <div className="flex items-start gap-2">
 <span
 className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider"style={{ backgroundColor: codeBg, color: muted }}
 title={it.kind}
 >
 {kindKey ? t(kindKey as DictKey) : it.kind}
 </span>
 <div className="min-w-0 flex-1">
 <div
 className="truncate text-xs font-semibold"style={{ color: '#18181b'}}
 title={it.title}
 >
 {it.title}
 </div>
 <div className="text-xs"style={{ color: muted }}>
 {new Date(it.created_at).toLocaleString(
 'zh-CN',
 )}
 {it.tags?.length ? ` · ${it.tags.map((tg) =>'#'+ tg).join('')}` :''}
 </div>
 </div>
 </div>

 {expanded && (
 <pre
 className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded p-2 text-xs"style={{
 backgroundColor: codeBg,
 color: '#27272a',
 fontFamily:'inherit',
 }}
 >
 {it.body}
 </pre>
 )}

 <div className="mt-2 flex flex-wrap gap-1">
 <button
 onClick={() => setExpandedId(expanded ? null : it.id)}
 className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
 {expanded ?'收起':'查看'}
 </button>
 <button
 onClick={() => copy(it)}
 className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
 {copiedId === it.id ? t('insights.btn.copied') : t('insights.btn.copy')}
 </button>
 <button
 onClick={() => downloadOne(it)}
 className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
 ⬇ {t('insights.btn.download')}
 </button>
 <button
 onClick={() => remove(it.id)}
 className="ml-auto inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500 hover:bg-red-100 hover:text-red-700">
 <ICON.trash size={14} />
 {t('insights.btn.delete')}
 </button>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
}

// ─────────────────────────────────────────────────────────────────────
// Memories panel (preferences viewer — view, delete agent's KV memory)
// ─────────────────────────────────────────────────────────────────────

function MemoriesPanel() {
 const [prefs, setPrefs] = useState<Preference[]>([]);
 const [loading, setLoading] = useState(false);
 const [expandedKey, setExpandedKey] = useState<string | null>(null);
 const [scopeFilter, setScopeFilter] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 // Phase 1: include=meta gets us scope / confidence / last_used / last_confirmed
 const r = await fetch('/api/preferences?include=meta', { cache:'no-store'});
 if (r.ok) {
 const data = (await r.json()) as { preferences: Preference[] };
 setPrefs(data.preferences ?? []);
 }
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 const remove = async (key: string) => {
 if (!confirm(t('memories.confirmDelete'))) return;
 try {
 const r = await fetch(`/api/preferences?key=${encodeURIComponent(key)}`, { method:'DELETE'});
 if (r.ok) await load();
 } catch {
 // ignore
 }
 };

 const cardBg = '#ffffff';
 const cardBorder = '#e4e4e7';
 const muted = '#71717a';
 const codeBg = '#f4f4f5';

 // Phase 1: detect conflicts (same key with different values shouldn't happen
 // due to PK, but two prefs with similar key prefix + low recency = suspicious)
 // For now, just highlight entries with confidence < 0.5 as"low trust".
 const filtered = scopeFilter
 ? prefs.filter((p) => p.scope === scopeFilter)
 : prefs;

 // Aggregate counts per scope for the filter chips
 const scopeCounts = prefs.reduce<Record<string, number>>((acc, p) => {
 const s = p.scope ??'account';
 acc[s] = (acc[s] ?? 0) + 1;
 return acc;
 }, {});

 return (
 <div>
 <div className="mb-3 flex flex-wrap items-center gap-1">
 <span className="text-xs"style={{ color: muted }}>
 {loading ? t('source.statusMsg.loading') : `${prefs.length} ${t('memories.count')}`}
 </span>
 </div>

 {/* Scope filter chips */}
 <div className="mb-3 flex flex-wrap gap-1">
 <ScopeChip
 label="all"count={prefs.length}
 active={scopeFilter === null}
 onClick={() => setScopeFilter(null)}
 />
 {Object.entries(scopeCounts).map(([s, n]) => (
 <ScopeChip
 key={s}
 label={s}
 count={n}
 active={scopeFilter === s}
 onClick={() => setScopeFilter(s)}
 />
 ))}
 </div>

 {filtered.length === 0 && !loading && (
 <div
 style={{
 padding:'24px 16px',
 textAlign:'center',
 color: muted,
 fontSize:'12px',
 border: `1px dashed ${cardBorder}`,
 borderRadius:'8px',
 backgroundColor: codeBg,
 }}
 >
 {t('memories.empty')}
 </div>
 )}

 <div className="space-y-1.5">
 {filtered.map((p) => {
 const expanded = expandedKey === p.key;
 const conf = p.confidence ?? 1;
 const lastUsed = p.last_used_at ? new Date(p.last_used_at) : null;
 const daysSinceUse = lastUsed
 ? Math.floor((Date.now() - lastUsed.getTime()) / 86_400_000)
 : null;
 const isCold = daysSinceUse !== null && daysSinceUse > 90;
 const isNeverUsed = lastUsed === null;
 return (
 <div
 key={p.key}
 style={{
 border: `1px solid ${isCold || conf < 0.5 ?'#f59e0b': cardBorder}`,
 borderRadius:'8px',
 backgroundColor: cardBg,
 padding:'8px 10px',
 }}
 >
 <div className="flex items-center gap-2">
 <code
 className="flex-1 truncate rounded px-1.5 py-0.5 font-mono text-xs"style={{
 backgroundColor: codeBg,
 color: '#27272a',
 }}
 >
 {p.key}
 </code>
 <span
 className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider"style={{
 backgroundColor: codeBg,
 color: muted,
 }}
 title={`scope: ${p.scope ??'account'}`}
 >
 {p.scope ??'account'}
 </span>
 <span
 className="shrink-0 text-xs"style={{
 color: p.has_value
 ? '#059669': muted,
 }}
 title={p.is_secret ?'secret':'value'}
 >
 {p.is_secret
 ? t('memories.secret')
 : p.has_value
 ?'● set': t('memories.notSet')}
 </span>
 <button
 onClick={() => remove(p.key)}
 className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-red-100 hover:text-red-700"aria-label="删除"title="删除">
 <ICON.trash size={14} />
 </button>
 </div>
 {/* lifecycle row: confidence + last used */}
 <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs"style={{ color: muted }}>
 <span title="confidence">
 <span
 style={{
 color:
 conf >= 0.8
 ?'#10b981': conf >= 0.5
 ?'#f59e0b':'#ef4444',
 fontWeight: 600,
 }}
 >
 ●
 </span>{''}
 conf {conf.toFixed(2)}
 </span>
 <span>
 {isNeverUsed
 ?'从未用过': isCold
 ? `${daysSinceUse} 天前用过 (cold)`
 : daysSinceUse === 0
 ?'今天用过': `${daysSinceUse} 天前用过`}
 </span>
 {p.last_confirmed_at && (
 <span className="inline-flex items-center gap-0.5"title="last_confirmed_at">
 <ICON.checkPlain size={14} />
 {(p.last_confirmed_at ??'').slice(0, 10)}
 </span>
 )}
 </div>
 {!p.is_secret && p.has_value && (
 <button
 onClick={() => setExpandedKey(expanded ? null : p.key)}
 className="mt-1 text-xs"style={{ color: muted }}
 >
 {expanded ?'收起':'查看值'}
 </button>
 )}
 {expanded && !p.is_secret && (
 <pre
 className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 text-xs"style={{
 backgroundColor: codeBg,
 color: '#27272a',
 fontFamily:'ui-monospace, SFMono-Regular, monospace',
 }}
 >
 {JSON.stringify(p.value, null, 2)}
 </pre>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}

function ScopeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
 return (
 <button
 onClick={onClick}
 className="rounded-full px-2.5 py-0.5 text-xs font-medium transition"style={{
 backgroundColor: active
 ? '#e4e4e7':'transparent',
  color: active
  ? '#18181b': '#71717a',
 border: `1px solid ${active ?'transparent': '#e4e4e7'}`,
 }}
 >
 {label} <span style={{ opacity: 0.6 }}>· {count}</span>
 </button>
 );
}

// ─────────────────────────────────────────────────────────────────────
// LibraryModal — full-page modal wrapper for the 3 panels
// ─────────────────────────────────────────────────────────────────────

function LibraryModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
 useEffect(() => {
 if (!open) return;
 const onKey = (e: KeyboardEvent) => {
 if (e.key ==='Escape') onClose();
 };
 document.addEventListener('keydown', onKey);
 return () => document.removeEventListener('keydown', onKey);
 }, [open, onClose]);

 if (!open) return null;

 const bg = '#ffffff';
 const border = '#e4e4e7';

 return (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center"style={{ backgroundColor:'rgba(0,0,0,0.45)'}}
 onClick={onClose}
 >
 <div
 className="relative flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl"style={{ backgroundColor: bg, border: `1px solid ${border}` }}
 onClick={(e) => e.stopPropagation()}
 >
 <div
 className="flex shrink-0 items-center justify-between border-b px-5 py-3"style={{ borderColor: border }}
 >
 <h2
 className="text-base font-semibold"style={{ color: '#18181b'}}
 >
 {title}
 </h2>
 <button
 onClick={onClose}
 className="rounded-lg p-1.5 transition hover:bg-zinc-100"style={{ color: '#71717a'}}
 aria-label="Close">
 <svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="M18 6L6 18M6 6l12 12"/>
 </svg>
 </button>
 </div>
 <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
 </div>
 </div>
 );
}

// ─────────────────────────────────────────────────────────────────────
// User menu popover (ChatGPT pattern: click avatar → small menu bottom-left)
// ─────────────────────────────────────────────────────────────────────

function UserMenu({
  user,
  showToolTrace,
  setShowToolTrace,
  onLogout,
  compact,
}: {
  user: { email: string; display_name: string | null };
  showToolTrace: boolean;
  setShowToolTrace: (v: boolean) => void;
 onLogout: () => void;
 compact?: boolean;
}) {
 const [open, setOpen] = useState(false);
 const ref = useRef<HTMLDivElement>(null);

 useEffect(() => {
 if (!open) return;
 const onClick = (e: MouseEvent) => {
 if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
 };
 document.addEventListener('mousedown', onClick);
 return () => document.removeEventListener('mousedown', onClick);
 }, [open]);

 const initial = (user.display_name || user.email).charAt(0).toUpperCase();

 // Inline styles for the pill and dropdown
 // (theme-independent so the styling is consistent across sessions)
 // 
 const pillBg = '#ffffff';
 const pillColor = '#18181b';
 const dropdownBg = '#ffffff';
 const dropdownBorder = '#e4e4e7';
 const dropdownDivider = '#f4f4f5';
 const dropdownText = '#18181b';
 const dropdownMuted = '#71717a';
 const dropdownHover = '#f4f4f5';
 const activeTabBg = '#f4f4f5';

 return (
 <div ref={ref} className="relative">
 <button
 onClick={() => setOpen((o) => !o)}
 className={`flex w-full items-center ${
 compact
 ?'justify-center p-1.5':'gap-2.5 rounded-lg p-2 text-left transition hover:bg-zinc-100'}`}
 style={
 compact
 ? undefined
 : { backgroundColor: pillBg, color: pillColor, cursor:'pointer'}
 }
 title={t('menu.userMenuAria')}
 aria-label={t('menu.userMenuAria')}
 >
 <div
 className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"style={{
 backgroundColor: '#f4f4f5',
 color: '#3f3f46',
 }}
 >
 {initial}
 </div>
 {!compact && (
 <>
 <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
 <div style={{ fontSize:'12px', fontWeight: 600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
 {user.display_name || user.email.split('@')[0]}
 </div>
 <div style={{ fontSize:'10px', opacity: 0.8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
 {user.email}
 </div>
 </div>
 <svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"style={{ flexShrink: 0, opacity: 0.7 }}>
 <path d="M6 9l6 6 6-6"/>
 </svg>
 </>
 )}
 </button>

 {open && (
 <div
 style={{
 position:'absolute',
 left: compact ?'52px':'0',
 bottom: compact ?'0':'calc(100% + 8px)',
 width:'240px',
 zIndex: 50,
 backgroundColor: dropdownBg,
 border: `1px solid ${dropdownBorder}`,
 borderRadius:'12px',
 boxShadow:'0 12px 28px rgba(0, 0, 0, 0.18)',
 color: dropdownText,
 overflow:'hidden',
 }}
 >
 <div style={{ borderBottom: `1px solid ${dropdownDivider}`, padding:'10px 12px'}}>
 <div style={{ fontSize:'12px', fontWeight: 600 }}>
 {user.display_name || user.email}
 </div>
 <div style={{ fontSize:'10px', color: dropdownMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
 {user.email}
 </div>
 </div>

  <div style={{ borderBottom: `1px solid ${dropdownDivider}`, padding:'8px 10px'}}>
  <div style={{ padding:'0 0 4px', fontSize:'10px', fontWeight: 500, textTransform:'uppercase', letterSpacing:'0.04em', color: dropdownMuted }}>
  {t('menu.display')}
  </div>
  <label
  style={{
  display:'flex',
  alignItems:'center',
  justifyContent:'space-between',
  gap:'8px',
  padding:'4px 0',
  cursor:'pointer',
  }}
  title={t('menu.showToolTrace.hint')}
  >
  <span style={{ fontSize:'11px', color: dropdownText }}>{t('menu.showToolTrace')}</span>
  <span
  onClick={(e) => { e.preventDefault(); setShowToolTrace(!showToolTrace); }}
  role="switch"aria-checked={showToolTrace}
  style={{
  position:'relative',
  width:'32px',
  height:'18px',
  borderRadius:'9px',
 backgroundColor: showToolTrace ?'#8b5cf6': dropdownMuted,
 transition:'background-color 150ms',
 cursor:'pointer',
 flexShrink: 0,
 }}
 >
 <span
 style={{
 position:'absolute',
 top:'2px',
 left: showToolTrace ?'16px':'2px',
 width:'14px',
 height:'14px',
 borderRadius:'50%',
  backgroundColor:'#fff',
  transition:'left 150ms',
  }}
  />
  </span>
  </label>
  </div>

  <button
  onClick={() => {
  setOpen(false);
  onLogout();
  }}
  style={{
  display:'block',
  width:'100%',
  padding:'8px 12px',
  textAlign:'left',
  fontSize:'12px',
  background:'none',
  border:'none',
 cursor:'pointer',
 color: dropdownText,
 }}
 onMouseEnter={(e) => {
 (e.currentTarget as HTMLButtonElement).style.backgroundColor = dropdownHover;
 }}
 onMouseLeave={(e) => {
 (e.currentTarget as HTMLButtonElement).style.backgroundColor ='transparent';
 }}
 >
 {t('menu.logout')}
 </button>
 </div>
 )}
 </div>
 );
}

// ─────────────────────────────────────────────────────────────────────
// Model picker (topbar) — click the model name → dropdown of available
// models. Each item shows a short description; the active one is checked.

function ModelPicker({
 model,
 setModel,
}: {
 model: ModelId;
 setModel: (m: ModelId) => void;
}) {
 const [open, setOpen] = useState(false);
 const ref = useRef<HTMLDivElement>(null);
 const current = MODELS.find((m) => m.id === model) ?? MODELS[0];

 useEffect(() => {
 if (!open) return;
 const onClick = (e: MouseEvent) => {
 if (ref.current && !ref.current.contains(e.target as Node)) {
 setOpen(false);
 }
 };
 document.addEventListener('mousedown', onClick);
 return () => document.removeEventListener('mousedown', onClick);
 }, [open]);

 return (
 <div ref={ref} className="relative">
 <button
 type="button"onClick={() => setOpen((v) => !v)}
 className="flex items-center gap-1.5 rounded-full px-1 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"aria-label="Select model"aria-expanded={open}
 >
 <span>{current.label}</span>
 <svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="M6 9l6 6 6-6"/>
 </svg>
 </button>
 {open && (
 <div className="absolute bottom-full left-1/2 z-50 mb-2 w-[300px] -translate-x-1/2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
 <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
 切换模型
 </div>
 {MODELS.map((m) => {
 const active = m.id === model;
 return (
 <button
 key={m.id}
 type="button"onClick={() => {
 setModel(m.id);
 setOpen(false);
 }}
 className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50">
 <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-semibold text-zinc-600">
 {m.badge}
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <span className="text-sm font-medium text-zinc-900">
 {m.label}
 </span>
 {active && (
 <svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5"className="text-emerald-500">
 <path d="M5 12l5 5L20 7"/>
 </svg>
 )}
 </div>
 <div className="mt-0.5 text-xs text-zinc-500">
 {m.description}
 </div>
 </div>
 </button>
 );
 })}
 </div>
 )}
 </div>
 );
}

// ─────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────

type ConvMode ='auto'|'expert'|'assistant';

function ModePicker({
  mode,
  onChange,
  disabled,
}: {
  mode: ConvMode;
  onChange: (m: ConvMode) => void;
  disabled?: boolean;
}) {
 const [open, setOpen] = useState(false);
 const ref = useRef<HTMLDivElement>(null);

 useEffect(() => {
 if (!open) return;
 const onClick = (e: MouseEvent) => {
 if (ref.current && !ref.current.contains(e.target as Node)) {
 setOpen(false);
 }
 };
 document.addEventListener('mousedown', onClick);
 return () => document.removeEventListener('mousedown', onClick);
 }, [open]);

 const options: { id: ConvMode; label: DictKey; desc: DictKey; dot: string }[] = [
 { id:'auto', label:'mode.auto.label', desc:'mode.auto.desc', dot:'bg-zinc-400'},
 { id:'expert', label:'mode.expert.label', desc:'mode.expert.desc', dot:'bg-amber-400'},
 { id:'assistant', label:'mode.assistant.label', desc:'mode.assistant.desc', dot:'bg-emerald-500'},
 ];
 const current = options.find((o) => o.id === mode) ?? options[0];

 return (
 <div ref={ref} className="relative">
 <button
 type="button"onClick={() => !disabled && setOpen((v) => !v)}
 disabled={disabled}
 className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"aria-label={t('mode.label')}
 aria-expanded={open}
 >
 <span className={`h-1.5 w-1.5 rounded-full ${current.dot}`} />
 <span>{t(current.label)}</span>
 <svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="M6 9l6 6 6-6"/>
 </svg>
 </button>
 {open && (
 <div className="absolute bottom-full right-0 z-50 mb-2 w-[280px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
 <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
 {t('mode.label')}
 </div>
 {options.map((o) => {
 const active = o.id === mode;
 return (
 <button
 key={o.id}
 type="button"onClick={() => {
 onChange(o.id);
 setOpen(false);
 }}
 className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50">
 <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${o.dot}`} />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <span className="text-sm font-medium text-zinc-900">
 {t(o.label)}
 </span>
 {active && (
 <span className="text-xs text-emerald-600">
 <ICON.checkPlain size={14} />
 </span>
 )}
 </div>
 <div className="mt-0.5 text-xs text-zinc-500">
 {t(o.desc)}
 </div>
 </div>
 </button>
 );
 })}
 </div>
 )}
 </div>
 );
}

export default function Home() {
 const { openLogin, user: currentUser, setUser: setCurrentUser, authReady: authChecked } = useAuthModal();
 const [messages, setMessages] = useState<DisplayMessage[]>([]);
 const [input, setInput] = useState('');
 const [status, setStatus] = useState<'idle'|'streaming'>('idle');
 const [streamingId, setStreamingId] = useState<string | null>(null);
 const [streamingText, setStreamingText] = useState('');
 const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
 const [error, setError] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrationDone, setHydrationDone] = useState(false);

  // Show tool call trace in the chat (debug-style cards). Default OFF — the
  // target users (non-technical content operators) care about results, not
  // process. The agent's natural reply already conveys"已存 / 已查"via the
  // `Save / Check` convention. Turn ON only for debugging.
  const [showToolTrace, setShowToolTraceState] = useState(false);
  const setShowToolTrace = useCallback((v: boolean) => {
  setShowToolTraceState(v);
  if (typeof window !=='undefined') {
 window.localStorage.setItem(TOOL_TRACE_STORAGE_KEY, v ?'1':'0');
 }
 }, []);

 // Selected LLM model. Persisted to localStorage; defaults to flash.
 const [model, setModelState] = useState<ModelId>(DEFAULT_MODEL);
 const setModel = useCallback((m: ModelId) => {
 setModelState(m);
 if (typeof window !=='undefined') {
 window.localStorage.setItem(MODEL_STORAGE_KEY, m);
 }
 }, []);

 // Conversation mode (auto/expert/assistant). Per-conversation, default'auto'.
 const [mode, setModeState] = useState<ConvMode>('auto');
 // Per-turn mode decision when in auto mode. Set by `mode_decided` SSE event
 // and shown as a small badge next to the user message. Resets on new turn.
 const [lastDecidedMode, setLastDecidedMode] = useState<'expert'|'assistant'| null>(null);

 // Sidebar collapses from 260px to 60px (icon rail). Never unmounts.
 const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
 const [showInbox, setShowInbox] = useState(false);
 // Mobile drawer state — independent of sidebarCollapsed because they
 // serve different purposes:
 // - sidebarCollapsed: desktop"icon rail"mode (60px wide, always visible)
 // - mobileNavOpen: mobile drawer overlay (full width, slides over chat)
 const [mobileNavOpen, setMobileNavOpen] = useState(false);
 const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
 const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
 const sidebarWidth = sidebarCollapsed ? 60 : 260;
 const [conversations, setConversations] = useState<ConversationSummary[]>([]);

 const messagesEndRef = useRef<HTMLDivElement>(null);
 const mainScrollRef = useRef<HTMLDivElement>(null);
 // Track whether the user is at the bottom of the chat. We only auto-scroll
 // to the bottom on streaming new content when they're already there — so
 // scrolling up to read old messages doesn't get yanked back. Slack/Discord
 // pattern. (We do NOT use this gate for the"jump to bottom"effect on
 // conversation change — see the [conversationId] effect below.)
 const isAtBottomRef = useRef(true);
 //"Force instant scroll on the next messages change."Set when the
 // conversation changes (including initial null → first id on page load).
 // The scroll effect then does an instant (non-smooth) jump to the bottom
 // for the first messages batch of the new conversation, then resumes
 // smooth follow for streaming. This avoids the"scroll animation that
 // drags on for 300ms every time you load a conversation"complaint.
 const forceInstantScrollRef = useRef(true); // start true: first load is instant
 const inputRef = useRef<HTMLTextAreaElement>(null);
 const abortRef = useRef<AbortController | null>(null);
 const conversationIdRef = useRef<string | null>(null);

 useEffect(() => {
 conversationIdRef.current = conversationId;
 }, [conversationId]);

 // Re-arm the"instant scroll"flag every time the conversation changes,
 // including the null → first id transition on page load. The scroll
 // effect below will then do an instant (non-animated) jump on the next
 // messages batch.
  useEffect(() => {
  forceInstantScrollRef.current = true;
  }, [conversationId]);


 // Re-hydrate model selection
 useEffect(() => {
 if (typeof window ==='undefined') return;
 const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
 if (saved ==='deepseek-v4-flash'|| saved ==='deepseek-v4-pro') {
 setModelState(saved);
 }
 }, []);

 // Re-hydrate tool-trace preference (default OFF).
 useEffect(() => {
 if (typeof window ==='undefined') return;
 const saved = window.localStorage.getItem(TOOL_TRACE_STORAGE_KEY);
 if (saved ==='1') setShowToolTrace(true);
 }, []);

 // Lock body scroll when the mobile drawer is open, so the page behind
 // the drawer doesn't bounce on touch.
 useEffect(() => {
 if (typeof document ==='undefined') return;
 if (mobileNavOpen) {
 const prev = document.body.style.overflow;
 document.body.style.overflow ='hidden';
 return () => {
 document.body.style.overflow = prev;
 };
 }
 }, [mobileNavOpen]);

 const refreshConversations = useCallback(async () => {
 try {
 const r = await fetch('/api/conversations', { cache:'no-store'});
 if (r.ok) {
 const data = (await r.json()) as { conversations: ConversationSummary[] };
 setConversations(data.conversations ?? []);
 }
 } catch {
 // ignore
 }
 }, []);

 const switchToConversation = useCallback(async (id: string) => {
 if (typeof window ==='undefined') return;
 window.localStorage.setItem(CONV_KEY, id);
 setConversationId(id);
 setError(null);
 setToolCalls([]);
 setStreamingText('');
 setStatus('idle');
 setLastDecidedMode(null);
 // Auto-close the mobile drawer once a conversation is selected, so the
 // user sees the chat rather than a still-open sidebar overlay.
 setMobileNavOpen(false);

 try {
 const r = await fetch(`/api/conversations/${id}/messages`, {
 cache:'no-store',
 });
 if (!r.ok) {
 setMessages([]);
 return;
 }
 const data = (await r.json()) as {
 conversation?: { mode?: ConvMode };
 messages?: Array<{
 id: string;
 role:'user'|'assistant';
 content: string | null;
 metadata?: { attachments?: Attachment[] };
 created_at?: string;
 }>;
 };
 // Sync the conversation's mode into local state.
 if (data.conversation?.mode) {
 setModeState(data.conversation.mode);
 } else {
 setModeState('auto');
 }
 const restored: DisplayMessage[] = (data.messages ?? [])
 .filter((m) => m.role ==='user'|| m.role ==='assistant')
 .map((m) => ({
 id: m.id,
 role: m.role,
 content: m.content ??'',
 attachments: m.metadata?.attachments,
 createdAt: m.created_at ? new Date(m.created_at).getTime() : undefined,
 }));
 setMessages(restored);
 } catch {
 setMessages([]);
 }
 }, []);

 const setMode = useCallback(
 async (next: ConvMode) => {
 setModeState(next);
 setLastDecidedMode(null);
 // If conversation exists, persist. If not, the next chat request
 // will pass `mode` and the server will use it on insert.
 if (conversationId) {
 try {
 await fetch(`/api/conversations/${conversationId}`, {
 method:'PATCH',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ mode: next }),
 });
 // Update the sidebar list cache so the conversation summary reflects the change.
 setConversations((prev) =>
 prev.map((c) => (c.id === conversationId ? { ...c, mode: next } : c)),
 );
 } catch {
 // ignore — local state already updated
 }
 }
 },
 [conversationId],
 );

 const startNewChat = useCallback(() => {
 if (typeof window !=='undefined') {
 window.localStorage.removeItem(CONV_KEY);
 }
 setConversationId(null);
 setMessages([]);
 setToolCalls([]);
 setError(null);
 setModeState('auto');
 setLastDecidedMode(null);
 setMobileNavOpen(false);
 setStreamingText('');
 setStatus('idle');
 setTimeout(() => inputRef.current?.focus(), 50);
 }, []);

 // (auth 状态从 useAuthModal 取,见顶部)

 const logout = useCallback(async () => {
 try {
 await fetch('/api/auth/logout', { method:'POST'});
 } catch {
 // ignore
 }
 if (typeof window !=='undefined') {
 window.localStorage.removeItem(CONV_KEY);
 }
 // 切回 guest 模式,不需要 reload — context 已经把 user 清空
 setCurrentUser(null);
 setMessages([]);
 setConversationId(null);
 setToolCalls([]);
 setModeState('auto');
 setStatus('idle');
 setError(null);
 }, [setCurrentUser]);

  // After auth: load history + conv list
  useEffect(() => {
  if (!authChecked) return;
  if (typeof window ==='undefined') return;
  const saved = window.localStorage.getItem(CONV_KEY);
  refreshConversations();

 if (!saved) {
 setHydrationDone(true);
 setTimeout(() => inputRef.current?.focus(), 100);
 return;
 }
 setConversationId(saved);
 (async () => {
 try {
 const r = await fetch(`/api/conversations/${saved}/messages`, {
 cache:'no-store',
 });
 if (r.status === 404 || r.status === 401) {
 window.localStorage.removeItem(CONV_KEY);
 setConversationId(null);
 return;
 }
 if (!r.ok) return;
 const data = (await r.json()) as {
 messages?: Array<{
 id: string;
 role:'user'|'assistant';
 content: string | null;
 metadata?: { attachments?: Attachment[] };
 created_at?: string;
 }>;
 };
 const restored: DisplayMessage[] = (data.messages ?? [])
 .filter((m) => m.role ==='user'|| m.role ==='assistant')
 .map((m) => ({
 id: m.id,
 role: m.role,
 content: m.content ??'',
 attachments: m.metadata?.attachments,
 createdAt: m.created_at ? new Date(m.created_at).getTime() : undefined,
 }));
 if (restored.length > 0) setMessages(restored);
 } catch {
 // ignore
 } finally {
 setHydrationDone(true);
 setTimeout(() => inputRef.current?.focus(), 100);
 }
 })();
 }, [authChecked, refreshConversations]);

 // 当用户从 guest → 登录时,重新拉一次对话列表
 useEffect(() => {
 if (!currentUser) return;
 refreshConversations();
 }, [currentUser, refreshConversations]);

 useEffect(() => {
 const el = mainScrollRef.current;
 if (!el) return;
 const onScroll = () => {
 //"At bottom"if within 80px of the bottom — gives some slack so
 // tiny scroll positions don't break the"user is reading"detection.
 const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
 isAtBottomRef.current = distance < 80;
 };
 onScroll();
 el.addEventListener('scroll', onScroll, { passive: true });
 return () => el.removeEventListener('scroll', onScroll);
 }, []);

 // useLayoutEffect (NOT useEffect) so the scroll runs synchronously
 // *before* the browser paints — no chance for the user to see a
 //"scrolling down"animation on page refresh or conversation switch.
 useLayoutEffect(() => {
 // Nothing to scroll to yet (empty array on first render before
 // async fetch resolves). Bail out — both paths need content to
 // do anything meaningful.
 if (messages.length === 0) return;

 // First messages batch for the current conversation → instant jump.
 // No smooth animation: the user wants to be at the bottom NOW.
 if (forceInstantScrollRef.current) {
 forceInstantScrollRef.current = false;
 const el = mainScrollRef.current;
 if (el) {
 el.scrollTop = el.scrollHeight;
 isAtBottomRef.current = true;
 }
 return;
 }
 // Subsequent updates (streaming tokens, new user/assistant messages
 // within the same conversation) → smooth follow only if user is at
 // the bottom, so scrolling up to read isn't disturbed.
 if (isAtBottomRef.current) {
 messagesEndRef.current?.scrollIntoView({ behavior:'smooth'});
 }
 }, [messages, streamingText, toolCalls]);

 useEffect(() => {
 const el = inputRef.current;
 if (!el) return;
 el.style.height ='auto';
 el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
 }, [input]);

 const send = useCallback(
 async (text: string) => {
 const trimmed = text.trim();
 if (!trimmed || status ==='streaming') return;

 setError(null);
 setToolCalls([]);

 const userMsg: DisplayMessage = {
 id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
 role:'user',
 content: trimmed,
 attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
 createdAt: Date.now(),
 };

 const history = messages.map((m) => ({
 role: m.role,
 content: m.content,
 }));
 const nextMessages = [...messages, userMsg];
 setMessages(nextMessages);
 setInput('');
 setPendingAttachments([]); // clear after send
 setStatus('streaming');
 setLastDecidedMode(null);
 // User explicitly sent → jump to bottom so they see the response
 // streaming in (the auto-scroll effect will continue to follow).
 isAtBottomRef.current = true;
 requestAnimationFrame(() => {
 mainScrollRef.current?.scrollTo({ top: mainScrollRef.current.scrollHeight, behavior:'smooth'});
 });

 const streamId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
 setStreamingId(streamId);
 setStreamingText('');

 const controller = new AbortController();
 abortRef.current = controller;

 try {
 const res = await fetch('/api/chat', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({
 message: trimmed,
 history,
 conversationId: conversationIdRef.current,
 model,
 attachments: pendingAttachments,
 mode,
 }),
 signal: controller.signal,
 });

 if (!res.ok || !res.body) {
 throw new Error(`Server error: ${res.status} ${res.statusText}`);
 }

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer ='';

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });

 let sep;
 while ((sep = buffer.indexOf('\n\n')) !== -1) {
 const rawEvent = buffer.slice(0, sep);
 buffer = buffer.slice(sep + 2);
 const line = rawEvent.trim();
 if (!line.startsWith('data:')) continue;
 const payload = line.slice(5).trim();
 if (payload ==='[DONE]') continue;

 let evt: AgentEvent;
 try {
 evt = JSON.parse(payload);
 } catch {
 continue;
 }
 handleAgentEvent(evt, streamId);
 }
 }
 refreshConversations();
 } catch (e) {
 if ((e as Error).name !=='AbortError') {
 setError(e instanceof Error ? e.message : String(e));
 }
 } finally {
 setStatus('idle');
 setStreamingId(null);
 setStreamingText('');
 abortRef.current = null;
 }
 },
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [messages, status],
 );

 const handleAgentEvent = useCallback(
 (evt: AgentEvent, streamId: string) => {
 switch (evt.type) {
 case'conversation_assigned':
 setConversationId(evt.conversationId);
 if (typeof window !=='undefined') {
 window.localStorage.setItem(CONV_KEY, evt.conversationId);
 }
 break;
 case'tool_start':
 setToolCalls((prev) => [
 ...prev,
 {
 id: evt.toolCallId,
 name: evt.name,
 args: evt.args,
 status:'running',
 startedAt: Date.now(),
 },
 ]);
 break;
 case'tool_end':
 setToolCalls((prev) =>
 prev.map((tc) =>
 tc.id === evt.toolCallId
 ? {
 ...tc,
 status: evt.ok ?'done':'error',
 result: evt.result,
 ok: evt.ok,
 error: evt.error,
 endedAt: Date.now(),
 }
 : tc,
 ),
 );
 break;
 case'message_start':
 setStreamingText('');
 break;
 case'message_delta':
 setStreamingText((prev) => prev + evt.content);
 break;
 case'mode_decided':
 // Auto mode: agent's per-turn decision. Show a small badge.
 setLastDecidedMode(evt.mode);
 break;
 case'message_end':
 setMessages((prev) => [
 ...prev,
 { id: streamId, role:'assistant', content: evt.content, createdAt: Date.now() },
 ]);
 setStreamingText('');
 break;
 case'error':
 setError(evt.message);
 break;
 case'done':
 break;
 }
 },
 [],
 );

 const stop = useCallback(() => {
 abortRef.current?.abort();
 }, []);

 const handleSubmit = (e?: React.FormEvent) => {
 e?.preventDefault();
 if (!authChecked) return; // 还在验证登录态
 if (!currentUser) {
 openLogin();
 return;
 }
 if (input.trim()) send(input);
 };

 const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
 // Skip Enter-to-send while an IME (Chinese/Japanese/Korean input) is
 // composing — pressing Enter to confirm a candidate would otherwise
 // fire the message immediately.
 if (e.nativeEvent.isComposing || e.keyCode === 229) return;
 if (e.key ==='Enter'&& !e.shiftKey) {
 e.preventDefault();
 handleSubmit();
 }
 };

 // Visually empty = no messages AND (no tool calls OR trace hidden).
 // The user can't see tool calls when trace is off, so the empty state
 // (suggestion chips) should still show.
 const isEmpty =
 hydrationDone &&
 messages.length === 0 &&
 (toolCalls.length === 0 || !showToolTrace);

 if (!authChecked) {
 return (
 <div className="flex h-screen items-center justify-center bg-white text-zinc-400">
 <div className="flex items-center gap-2 text-sm">
 <svg
 className="h-4 w-4 animate-spin"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
 </svg>
 {'加载中…'}
 </div>
 </div>
 );
 }

 return (
 <div className="flex h-screen overflow-hidden bg-white text-zinc-900">
 {/* Desktop sidebar (sm+): in-flow, fixed width, collapses to icon rail */}
 <div
 className="hidden h-full shrink-0 sm:block"style={{ width: `${sidebarWidth}px`, transition:'width 200ms ease'}}
 >
  <Sidebar
  conversations={conversations}
  activeId={conversationId}
  onSelect={switchToConversation}
  onNew={startNewChat}
  onClose={() => setSidebarCollapsed(true)}
  currentUser={currentUser}
 onLogout={logout}
 narrow={sidebarCollapsed}
 showToolTrace={showToolTrace}
 setShowToolTrace={setShowToolTrace}
 />
 </div>

 {/* Mobile drawer (< sm): fixed overlay, slides in from left */}
 {mobileNavOpen && (
 <div className="fixed inset-0 z-40 sm:hidden">
 {/* Backdrop */}
 <div
  className="absolute inset-0 bg-black/30"onClick={() => setMobileNavOpen(false)}
 aria-hidden="true"/>
 {/* Drawer panel */}
 <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-zinc-200 bg-white shadow-xl">
  <Sidebar
  conversations={conversations}
  activeId={conversationId}
  onSelect={switchToConversation}
  onNew={startNewChat}
  onClose={() => setMobileNavOpen(false)}
  currentUser={currentUser}
 onLogout={logout}
 narrow={false}
 showToolTrace={showToolTrace}
 setShowToolTrace={setShowToolTrace}
 />
 </div>
 </div>
 )}

 <div className="relative flex min-w-0 flex-1 flex-col">
 {/* Top bar — mobile menu button (sm:hidden) + desktop expand
 button (sm:inline-flex). Model/mode live in the composer. */}
 <header className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-3">
 <button
 onClick={() => setMobileNavOpen(true)}
 className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 sm:hidden"aria-label="Open menu">
 <svg width="18"height="18"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round">
 <path d="M3 12h18M3 6h18M3 18h18"/>
 </svg>
 </button>
 {sidebarCollapsed && (
 <button
 onClick={() => setSidebarCollapsed(false)}
 className="hidden rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 sm:inline-flex"aria-label="Expand sidebar">
 <svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="M3 12h18M3 6h18M3 18h18"/>
 </svg>
 </button>
 )}
 <div className="flex-1"/>
 <InboxBadge onClick={() => setShowInbox(true)} />
 </header>

  <main ref={mainScrollRef} className="flex-1 overflow-y-auto">
  <div className="mx-auto w-full max-w-3xl px-3 pb-32 pt-2 sm:px-4 sm:pt-4">
  {isEmpty ? (
  <EmptyState />
  ) : (
 <MessageList
 messages={messages}
 toolCalls={toolCalls}
 streamingId={streamingId}
 streamingText={streamingText}
 status={status}
 error={error}
 onLightbox={setLightboxUrl}
 showToolTrace={showToolTrace}
 onHideToolTrace={() => setShowToolTrace(false)}
 conversationId={conversationId}
 />
 )}
 <div ref={messagesEndRef} />
 </div>
 </main>

  <Composer
  input={input}
  setInput={setInput}
  status={status}
  onSubmit={handleSubmit}
  onStop={stop}
  onKeyDown={handleKeyDown}
  inputRef={inputRef}
  pendingAttachments={pendingAttachments}
  setPendingAttachments={setPendingAttachments}
  onLightbox={setLightboxUrl}
  model={model}
  setModel={setModel}
  mode={mode}
  setMode={setMode}
  lastDecidedMode={lastDecidedMode}
  onPick={send}
  showSuggestions={isEmpty}
  />
 </div>

 {/* Image lightbox */}
 {lightboxUrl && (
 <div
 className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-8"onClick={() => setLightboxUrl(null)}
 >
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img
 src={lightboxUrl}
 alt=""className="max-h-full max-w-full rounded-lg"/>
 <button
 onClick={() => setLightboxUrl(null)}
 className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-2xl text-white hover:bg-white/40"aria-label="Close">
 ×
 </button>
 </div>
 )}

 {/* Inbox drawer (desktop: right side, mobile: full overlay) */}
 {showInbox && (
 <>
 <div
  className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"onClick={() => setShowInbox(false)}
 aria-hidden="true"/>
 <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-zinc-200 bg-white shadow-2xl sm:w-[480px]">
 <InboxPanel onClose={() => setShowInbox(false)} />
 </div>
 </>
 )}
 </div>
 );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state — greeting + top 3 prompt chips + 展开全部 11 项
// ─────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center pt-12 text-center sm:pt-20">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        你好,我是你的社交运营顾问
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        {t('empty.tagline')}
      </p>
    </div>
  );
}

/**
 * 11 项能力入口 — 左对齐聊天消息风格,坐在聊天框上方。
 * 默认 top 3,点"查看更多"展开全部,点"收起"收回。
 * 严格 NO 文字箭头 — 用 lucide icon 才合规。
 */
function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll
    ? SUGGESTED_PROMPT_KEYS
    : SUGGESTED_PROMPT_KEYS.slice(0, TOP_PROMPTS_COUNT);

  return (
    <div className="flex flex-col items-start gap-2">
      {visible.map((p) => (
        <button
          key={p.title}
          onClick={() => onPick(t(p.body))}
          className="rounded-lg bg-zinc-100 px-3.5 py-2 text-sm text-zinc-700 transition hover:bg-zinc-200"
        >
          {t(p.title)}
        </button>
      ))}
      <button
        onClick={() => setShowAll((v) => !v)}
        className="px-1.5 py-1 text-xs text-zinc-400 transition hover:text-zinc-700"
      >
        {showAll ? '收起' : '查看更多'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Message list — ChatGPT-style: assistant has no bubble, just text
// ─────────────────────────────────────────────────────────────────────

function MessageList({
 messages,
 toolCalls,
 streamingId,
 streamingText,
 status,
 error,
 onLightbox,
 showToolTrace,
 onHideToolTrace,
 conversationId,
}: {
 messages: DisplayMessage[];
 toolCalls: ToolCallDisplay[];
 streamingId: string | null;
 streamingText: string;
 status:'idle'|'streaming';
 error: string | null;
 onLightbox: (url: string) => void;
 showToolTrace: boolean;
 onHideToolTrace: () => void;
 conversationId: string | null;
}) {
 // Inline"展开"override — when the user clicks reveal on the summary
 // pill, we flip this for the rest of the session without persisting.
 const [revealOnce, setRevealOnce] = useState(false);
 const renderTrace = showToolTrace || revealOnce;

 const items: Array<
 | { kind:'message'; msg: DisplayMessage }
 | { kind:'streaming-bubble'; streamId: string; text: string }
 | { kind:'tool'; tool: ToolCallDisplay }
 | { kind:'tool-summary'; count: number; key: string }
 | { kind:'error'; text: string }
 > = [];

 for (const m of messages) items.push({ kind:'message', msg: m });

 // Tool calls: only render the verbose `ToolCard` when showToolTrace is on
 // (or the user clicked"展开"inline). When off and ≥2 tool calls, render
 // a single collapsed"did N things"pill so the user knows the agent did
 // work, but doesn't see the process.
 if (renderTrace) {
 for (const tc of toolCalls) items.push({ kind:'tool', tool: tc });
 } else if (toolCalls.length >= 2) {
 items.push({
 kind:'tool-summary',
 count: toolCalls.length,
 key: `tcsum_${toolCalls[0].id}`,
 });
 }

 if (status ==='streaming'&& streamingId) {
 items.push({
 kind:'streaming-bubble',
 streamId: streamingId,
 text: streamingText,
 });
 }
 if (error) items.push({ kind:'error', text: error });

 return (
 <div className="flex flex-col gap-7">
 {items.map((it, i) => {
 if (it.kind ==='message') return <Bubble key={it.msg.id} msg={it.msg} onLightbox={onLightbox} conversationId={conversationId} />;
 if (it.kind ==='streaming-bubble')
 return (
 <AssistantStreamBubble
 key={it.streamId}
 text={it.text}
 streaming={true}
 />
 );
 if (it.kind ==='tool')
 return (
 <ToolCard
 key={it.tool.id}
 tool={it.tool}
 showDismiss={!showToolTrace /* only show X when trace was on by global toggle, not local reveal */}
 onDismiss={onHideToolTrace}
 />
 );
 if (it.kind ==='tool-summary') {
 return (
 <ToolSummaryPill
 key={it.key}
 count={it.count}
 onReveal={() => setRevealOnce(true)}
 />
 );
 }
 return (
 <div
 key={`err${i}`}
 className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
 <strong className="font-semibold">Error:</strong> {it.text}
 </div>
 );
 })}
 </div>
 );
}

function ToolSummaryPill({ count, onReveal }: { count: number; onReveal: () => void }) {
 return (
 <div className="-mt-3 flex items-center gap-2 text-xs text-zinc-400">
 <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"/>
 <span>做了 {count} 步后台操作(记忆 / 查数据 等)</span>
 <button
 onClick={onReveal}
 className="ml-1 underline-offset-2 hover:text-zinc-600 hover:underline"type="button">
 展开
 </button>
 </div>
 );
}

function Bubble({ msg, onLightbox, conversationId }: { msg: DisplayMessage; onLightbox?: (url: string) => void; conversationId?: string | null }) {
 const attachments = msg.attachments ?? [];
 if (msg.role ==='user') {
 // ChatGPT: user messages have a subtle rounded bg, no bubble border.
 // Footer (copy + time) is right-aligned under the bubble.
 return (
 <div className="flex flex-col items-end gap-1">
 <div className="max-w-[85%] rounded-xl rounded-br-sm bg-zinc-100 px-4 py-2 text-sm text-zinc-900">
 {attachments.length > 0 && (
 <div className="mb-2 flex flex-wrap gap-1.5">
 {attachments.map((a) =>
 a.kind ==='image'? (
 /* eslint-disable-next-line @next/next/no-img-element */
 <img
 key={a.url}
 src={a.url}
 alt=""className="h-32 w-32 cursor-pointer rounded-lg border border-zinc-200 object-cover transition hover:opacity-90"onClick={() => onLightbox?.(a.url)}
 />
 ) : (
 <a
 key={a.url}
 href={a.url}
 target="_blank"rel="noreferrer"className="flex max-w-[200px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-zinc-700 transition hover:bg-zinc-50"title={`${a.name ?? a.url} (${a.ext?.toUpperCase() ??'?'})`}
 >
 <span className="text-base leading-none">
 {fileIconFor(a.kind, a.ext)}
 </span>
 <div className="min-w-0 flex-1">
 <div className="truncate text-xs font-medium">
 {a.name ?? a.url.split('/').pop()}
 </div>
 <div className="text-xs opacity-70">
 {a.ext?.toUpperCase() ??'?'} ·{''}
 {a.size < 1024 * 1024
 ? `${Math.round(a.size / 1024)}KB`
 : `${(a.size / 1024 / 1024).toFixed(1)}MB`}
 </div>
 </div>
 </a>
 ),
 )}
 </div>
 )}
 {msg.content && (
 <div className="whitespace-pre-wrap break-words">{msg.content}</div>
 )}
 </div>
 <MessageActions
 content={msg.content}
 createdAt={msg.createdAt}
 streaming={false}
 align="right"/>
 </div>
 );
 }
 return <AssistantStreamBubble text={msg.content} streaming={false} createdAt={msg.createdAt} conversationId={conversationId} messageId={msg.id} />;
}

function AssistantStreamBubble({
 text,
 streaming,
 createdAt,
 conversationId,
 messageId,
}: {
 text: string;
 streaming: boolean;
 createdAt?: number;
 conversationId?: string | null;
 messageId?: string;
}) {
 // Assistant: no bubble, no border. Markdown is rendered via ReactMarkdown +
 // remark-gfm (tables, strikethrough, task lists, autolinks). The raw text
 // is preserved for the copy button — we never stringify the rendered HTML.
 //
 // `displayText` strips a leading run of punctuation that the LLM sometimes
 // produces as a"list-continuation"artifact (e.g.", 最终版 bio"or
 //"; 接下来..."). The strip is bounded so we never eat real content like
 // a numbered list"1. xxx"— we only remove `,.;:` at the very start
 // (optionally preceded by whitespace), and stop at the first letter / digit
 // / Chinese char.
 const displayText = streaming ? text : stripLeadingPunctuation(text);
 return (
 <div className="group flex flex-col gap-2">
 <div className="text-sm leading-7 text-zinc-800">
 <div className="prose prose-zinc max-w-none break-words prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-2xl prose-h1:mt-4 prose-h1:mb-2 prose-h2:text-xl prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1.5 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-table:my-3 prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5 prose-hr:my-4 prose-hr:border-zinc-200 prose-pre:my-2 prose-pre:bg-zinc-950 prose-pre:text-zinc-100 prose-code:before:hidden prose-code:after:hidden">
 <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayText}</ReactMarkdown>
 {streaming && (
 <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-amber-400"/>
 )}
 </div>
 </div>
 <MessageActions
 content={displayText}
 createdAt={createdAt}
 streaming={streaming}
 conversationId={conversationId}
 messageId={messageId}
 />
 </div>
 );
}

/**
 * Strip a leading run of single-character punctuation + whitespace, stopping
 * at the first real word. Preserves"1. xxx"(digit) and"# header"/"##"* (markdown sigil + space) untouched. Only trims `,.;:` ` ` `\n` `\t`.
 *
 * Examples:
 *", 最终版 bio 给你:"→"最终版 bio 给你:"*"; 接下来..."→"接下来..."*"1. 第一步"→"1. 第一步"(digit preserved)
 *"## 标题"→"## 标题"(markdown heading preserved)
 */
function stripLeadingPunctuation(text: string): string {
 let i = 0;
 while (i < text.length) {
 const c = text[i];
 if (c ===''|| c ==='\n'|| c ==='\t'|| c ==='\r') {
 i++;
 continue;
 }
 if (c ===','|| c ===';'|| c ===':'|| c ==='.'|| c ==='、'|| c ===',') {
 // Comma-like fullwidth chars too
 i++;
 continue;
 }
 break;
 }
 return i > 0 ? text.slice(i) : text;
}

function MessageActions({
 content,
 createdAt,
 streaming,
 align ='left',
 conversationId,
 messageId,
}: {
 content: string;
 createdAt: number | undefined;
 streaming: boolean;
 /**'left'for assistant messages,'right'for user messages (so the
 * footer lines up with the bubble edge). */
 align?:'left'|'right';
 /** Only set for assistant messages; enables the"用了这条"button. */
 conversationId?: string | null;
 messageId?: string;
}) {
 const [copied, setCopied] = useState(false);

 const onCopy = useCallback(async () => {
 try {
 // Copy the RAW markdown text, not the rendered HTML — so when the
 // user pastes into another markdown editor (Notion, Obsidian, etc.)
 // formatting is preserved.
 await navigator.clipboard.writeText(content);
 setCopied(true);
 setTimeout(() => setCopied(false), 1500);
 } catch {
 // Fallback for environments without clipboard API: select-and-copy via
 // a hidden textarea. Rare path but worth handling.
 const ta = document.createElement('textarea');
 ta.value = content;
 ta.style.position ='fixed';
 ta.style.opacity ='0';
 document.body.appendChild(ta);
 ta.select();
 try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
 document.body.removeChild(ta);
 }
 }, [content]);

 const time = createdAt ? formatTime(createdAt) :'';

 // Hide while streaming — incomplete content shouldn't be copyable / time-shown.
 if (streaming) return null;

 return (
 <div
 className={`flex items-center gap-1.5 text-xs text-zinc-400 ${
 align ==='right'?'justify-end':'justify-start'}`}
 >
 <button
 type="button"onClick={onCopy}
 className="inline-flex h-6 w-6 items-center justify-center rounded transition hover:bg-zinc-100 hover:text-zinc-700"aria-label={copied ?'已复制':'复制'}
 title={copied ?'已复制': align ==='right'?'复制':'复制原始 markdown'}
 >
 {copied ? (
 <svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5"strokeLinecap="round"strokeLinejoin="round"className="text-emerald-500">
 <polyline points="20 6 9 17 4 12"/>
 </svg>
 ) : (
 <svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round">
 <rect x="9"y="9"width="13"height="13"rx="2"ry="2"/>
 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
 </svg>
 )}
 </button>
 {align ==='left'&& messageId && (
 <UsedTweetButton
 text={content}
 conversationId={conversationId ?? null}
 messageId={messageId}
 />
 )}
 {align ==='left'&& <CrossPostButton text={content} />}
 {time && <span className="tabular-nums">{time}</span>}
 </div>
 );
}

function formatTime(ms: number): string {
 const d = new Date(ms);
 const hh = String(d.getHours()).padStart(2,'0');
 const mm = String(d.getMinutes()).padStart(2,'0');
 return `${hh}:${mm}`;
}

function ToolCard({
 tool,
 showDismiss,
 onDismiss,
}: {
 tool: ToolCallDisplay;
 /** When true, show a X button on the right that turns off the global
 * tool-trace setting. Only set when the trace was enabled by the user
 * setting (not by the inline"展开"reveal). */
 showDismiss?: boolean;
 onDismiss?: () => void;
}) {
 const [open, setOpen] = useState(false);
 const durationMs =
 tool.endedAt && tool.startedAt ? tool.endedAt - tool.startedAt : null;

 return (
 <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-xs">
 <div className="flex w-full items-center">
 <button
 onClick={() => setOpen((o) => !o)}
 className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-zinc-100">
 <div className="flex items-center gap-2">
 <StatusDot status={tool.status} />
 <span className="font-mono text-zinc-700">
 {tool.name}
 </span>
 {durationMs !== null && (
 <span className="text-zinc-400">
 {durationMs}ms
 </span>
 )}
 </div>
 <span className="text-zinc-400">
 {open ?'▾':'▸'}
 </span>
 </button>
 {showDismiss && onDismiss && (
 <button
 type="button"onClick={onDismiss}
 className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"aria-label="隐藏所有工具调用"title="隐藏所有工具调用(以后都不显示)">
 <svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round">
 <path d="M18 6 6 18"/>
 <path d="m6 6 12 12"/>
 </svg>
 </button>
 )}
 </div>
 {open && (
 <div className="border-t border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-600">
 <div className="mb-1 text-zinc-400">args</div>
 <pre className="overflow-x-auto whitespace-pre-wrap break-all">
 {JSON.stringify(tool.args, null, 2)}
 </pre>
 <div className="mb-1 mt-3 text-zinc-400">
 {tool.ok === false ?'error':'result'}
 </div>
 <pre className="overflow-x-auto whitespace-pre-wrap break-all text-zinc-700">
 {tool.error
 ? tool.error
 : JSON.stringify(tool.result, null, 2).slice(0, 4000)}
 </pre>
 </div>
 )}
 </div>
 );
}

function StatusDot({ status }: { status: ToolCallDisplay['status'] }) {
 const color =
 status ==='running'?'bg-amber-500': status ==='done'?'bg-emerald-500':'bg-red-500';
 const pulse = status ==='running'?'animate-pulse':'';
 return <span className={`inline-block h-2 w-2 rounded-full ${color} ${pulse}`} />;
}

// ─────────────────────────────────────────────────────────────────────
// Attachment chip — image = thumbnail, text/pdf/other = icon + filename
// ─────────────────────────────────────────────────────────────────────

function fileIconFor(kind: string | undefined, ext: string | undefined): IconName {
 if (kind ==='image') return'image';
 if (kind ==='pdf'|| ext ==='pdf') return'book';
 if (kind ==='text') {
 if (['md','markdown','mdx'].includes(ext ??'')) return'fileText';
 if (['json','yml','yaml','toml','xml','csv','tsv'].includes(ext ??'')) return'settings';
 if (['html','htm','xml','svg','css','scss'].includes(ext ??'')) return'palette';
 if (['js','jsx','ts','tsx','mjs','cjs'].includes(ext ??'')) return'code';
 if (['py','rb','go','rs','java','kt'].includes(ext ??'')) return'code';
 if (['sh','bash','zsh','ps1'].includes(ext ??'')) return'monitor';
 if (['sql','graphql','gql'].includes(ext ??'')) return'database';
 return'fileText';
 }
 return'paperclip';
}

function PendingAttachmentChip({
 a,
 onRemove,
 onLightbox,
}: {
 a: Attachment;
 onRemove: () => void;
 onLightbox: () => void;
}) {
 const isImage = a.kind ==='image';
 const icon = fileIconFor(a.kind, a.ext);
 const sizeLabel = a.size < 1024
 ? `${a.size}B`
 : a.size < 1024 * 1024
 ? `${Math.round(a.size / 1024)}KB`
 : `${(a.size / 1024 / 1024).toFixed(1)}MB`;
 if (isImage) {
 return (
 <div
 className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-200"title={`${a.name ?? a.url} (${sizeLabel})`}
 >
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img
 src={a.url}
 alt=""className="h-full w-full cursor-pointer object-cover"onClick={onLightbox}
 />
 <button
 type="button"onClick={onRemove}
 className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"aria-label="Remove">
 ×
 </button>
 </div>
 );
 }
 // Non-image: icon + filename chip (click to download / preview)
 return (
 <div
 className="group relative flex h-16 max-w-[180px] items-center gap-1.5 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 px-2"title={`${a.name ?? a.url} (${sizeLabel})`}
 >
 <span className="text-base leading-none">{icon}</span>
 <div className="min-w-0 flex-1">
 <div className="truncate text-xs font-medium text-zinc-700">
 {a.name ?? a.url.split('/').pop()}
 </div>
 <div className="truncate text-xs text-zinc-500">
 {a.ext?.toUpperCase() ??'?'} · {sizeLabel}
 </div>
 </div>
 <a
 href={a.url}
 target="_blank"rel="noreferrer"className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"title="Open / download"onClick={(e) => e.stopPropagation()}
 >
 <svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5"strokeLinecap="round"strokeLinejoin="round">
 <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
 <polyline points="15 3 21 3 21 9"/>
 <line x1="10"y1="14"x2="21"y2="3"/>
 </svg>
 </a>
 <button
 type="button"onClick={onRemove}
 className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"aria-label="Remove">
 <svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5"strokeLinecap="round">
 <path d="M18 6L6 18M6 6l12 12"/>
 </svg>
 </button>
 </div>
 );
}

// ─────────────────────────────────────────────────────────────────────
// Composer — ChatGPT-style: floating pill, centered, more prominent
// ─────────────────────────────────────────────────────────────────────

function Composer({
  input,
  setInput,
  status,
  onSubmit,
  onStop,
  onKeyDown,
  inputRef,
  pendingAttachments,
  setPendingAttachments,
  onLightbox,
  model,
  setModel,
  mode,
  setMode,
  lastDecidedMode,
  onPick,
  showSuggestions,
}: {
  input: string;
  setInput: (v: string) => void;
  status:'idle'|'streaming';
  onSubmit: (e?: React.FormEvent) => void;
  onStop: () => void;
 onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
 inputRef: React.RefObject<HTMLTextAreaElement | null>;
 pendingAttachments: Attachment[];
 setPendingAttachments: (a: Attachment[]) => void;
 onLightbox: (url: string) => void;
  model: ModelId;
  setModel: (m: ModelId) => void;
  mode: ConvMode;
  setMode: (m: ConvMode) => void;
  lastDecidedMode:'expert'|'assistant'| null;
  onPick: (text: string) => void;
  showSuggestions: boolean;
}) {
 const streaming = status ==='streaming';
 const fileInputRef = useRef<HTMLInputElement>(null);
 const [dragOver, setDragOver] = useState(false);
 const [uploadError, setUploadError] = useState<string | null>(null);

 const MAX_FILES = 10;
 const MAX_BYTES = 10 * 1024 * 1024; // matches server limit

 const uploadFiles = async (files: FileList | File[]) => {
 setUploadError(null);
 const arr = Array.from(files);
 if (pendingAttachments.length + arr.length > MAX_FILES) {
 setUploadError(`最多 ${MAX_FILES} 个,当前 ${pendingAttachments.length}`);
 return;
 }
 for (const f of arr) {
 if (f.size > MAX_BYTES) {
 setUploadError(`${f.name} 超过 10MB`);
 return;
 }
 }
 const fd = new FormData();
 for (const f of arr) fd.append('files', f);
 try {
 const r = await fetch('/api/upload', { method:'POST', body: fd });
 if (!r.ok) {
 const data = await r.json().catch(() => ({}));
 setUploadError(data.error ??'上传失败');
 return;
 }
 const data = (await r.json()) as { files: Attachment[] };
 setPendingAttachments([...pendingAttachments, ...data.files]);
 } catch (e) {
 setUploadError(e instanceof Error ? e.message :'网络错误');
 }
 };

 const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
 if (e.target.files && e.target.files.length > 0) {
 uploadFiles(e.target.files);
 e.target.value =''; // allow re-selecting same file
 }
 };

 const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
 e.preventDefault();
 setDragOver(false);
 if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
 uploadFiles(e.dataTransfer.files);
 }
 };

  return (
  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white to-white/0 pb-4 pt-12 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
  {/* 11 项能力入口 — 只在新对话时显示,发出一条消息后就隐藏 */}
  {showSuggestions && (
  <div className="pointer-events-auto mx-auto mb-2 max-w-3xl px-4">
  <SuggestionChips onPick={onPick} />
  </div>
  )}
  <form
  onSubmit={onSubmit}
  className="pointer-events-auto mx-auto max-w-3xl px-4">
 <div
 className={`rounded-2xl border bg-white shadow-sm transition focus-within:border-amber-500 focus-within:shadow-md ${
 dragOver
 ?'border-amber-400 ring-2 ring-amber-100':'border-zinc-200'}`}
 onDragOver={(e) => {
 e.preventDefault();
 setDragOver(true);
 }}
 onDragLeave={() => setDragOver(false)}
 onDrop={onDrop}
 >
 {/* Pending attachments preview */}
 {pendingAttachments.length > 0 && (
 <div className="flex flex-wrap gap-2 px-3 pt-3">
 {pendingAttachments.map((a, i) => (
 <PendingAttachmentChip
 key={a.url}
 a={a}
 onRemove={() =>
 setPendingAttachments(
 pendingAttachments.filter((_, idx) => idx !== i),
 )
 }
 onLightbox={() => onLightbox(a.url)}
 />
 ))}
 <div className="flex h-16 items-center px-1 text-xs text-zinc-500">
 {pendingAttachments.length} / {MAX_FILES}
 </div>
 </div>
 )}
 {/* Upload error */}
 {uploadError && (
 <div className="px-4 pt-2 text-xs text-red-600">
 {uploadError}
 </div>
 )}
 {/* Textarea area (top half of the box) — 默认 2 行高度 */}
 <textarea
 ref={inputRef}
 rows={2}
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={onKeyDown}
 placeholder={
 streaming
 ?'agent 跑着呢…':'问点啥,Enter 发送,Shift+Enter 换行'}
 disabled={streaming}
 className="block w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-base leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:opacity-50"style={{ minHeight:'56px', maxHeight:'220px'}}
 />
 {/* Bottom row: [+ button] ... [mode] [model] [send] (MiniMax Code style) */}
 <div className="flex items-center gap-1.5 px-2 pb-2">
 {/* Upload button (left) */}
 <button
 type="button"onClick={() => fileInputRef.current?.click()}
 disabled={streaming || pendingAttachments.length >= MAX_FILES}
 className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 sm:h-8 sm:w-8"aria-label="Upload files"title="上传文件（最多 10 个,单文件 ≤10MB）">
 <svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round">
 <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
 </svg>
 </button>
 <input
 ref={fileInputRef}
 type="file"accept="image/*,.pdf,.txt,.md,.markdown,.json,.csv,.xml,.html,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.hpp,.cs,.php,.swift,.sh,.bash,.zsh,.ps1,.sql,.graphql,.gql,.yml,.yaml,.toml,.ini,.conf,.cfg,.env,.vue,.svelte,.mdx"multiple
 className="hidden"onChange={onFilePick}
 />
 {/* Spacer pushes everything to the right */}
 <div className="flex-1"/>
 {/* Auto-mode current-turn indicator (only when streaming & in auto) */}
 {mode ==='auto'&& lastDecidedMode && streaming && (
 <span
 className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
 lastDecidedMode ==='expert'?'bg-zinc-100 text-zinc-900':'bg-emerald-100 text-emerald-700'}`}
 title={t(`mode.decided.${lastDecidedMode}`)}
 >
 <span className={`h-1.5 w-1.5 rounded-full ${lastDecidedMode ==='expert'?'bg-amber-400':'bg-emerald-500'}`} />
 {t(`mode.decided.${lastDecidedMode}`)}
 </span>
 )}
 {/* Mode picker */}
 <ModePicker
 mode={mode}
 onChange={setMode}
 disabled={streaming}
 />
 {/* Model picker */}
 <ModelPicker model={model} setModel={setModel} />
 {/* Send / stop button */}
 <button
 type={streaming ?'button':'submit'}
 onClick={streaming ? onStop : undefined}
 className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-30 sm:h-8 sm:w-8 ${
 streaming
 ?'bg-zinc-100 text-zinc-700 hover:bg-zinc-200':'bg-amber-400 text-zinc-900 shadow-sm hover:bg-zinc-700'}`}
 disabled={!streaming && !input.trim() && pendingAttachments.length === 0}
 aria-label={streaming ?'Stop':'Send'}
 >
 {streaming ? (
 <svg width="12"height="12"viewBox="0 0 24 24"fill="currentColor">
 <rect x="6"y="6"width="12"height="12"rx="1"/>
 </svg>
 ) : (
 <svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round">
 <path d="M12 19V5M5 12l7-7 7 7"/>
 </svg>
 )}
 </button>
 </div>
 </div>
 </form>
 </div>
 );
}
