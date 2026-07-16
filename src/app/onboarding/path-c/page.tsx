'use client';

import { useState, useEffect } from'react';
import { useRouter } from'next/navigation';
import Link from'next/link';
import { listVoiceTemplates } from'@/lib/voiceTemplates';
import { ICON } from'@/lib/design';

type Step =
 |'q1'|'q2'|'q3'|'q4'|'q5'|'q6'|'synthesizing'|'done';

type ConversationData = {
 q1_activities: string[];
 q1_text: string;
 q2_topics: string[];
 q2_text: string;
 q3_goals: string[];
 q3_text: string;
 q4_length:'short'|'medium'|'long';
 q4_tone:'serious'|'casual'|'sharp'|'warm';
 q4_emoji:'never'|'sometimes'|'often';
 q4_text: string;
 q5_text: string;
 q6_text: string;
};

const STORAGE_KEY ='vp_onboarding_c_v1';

const STEP_LABELS: Record<Step, string> = {
 q1:'现在做什么',
 q2:'想聊什么',
 q3:'想获得什么',
 q4:'表达风格',
 q5:'欣赏什么',
 q6:'写一条',
 synthesizing:'合成中',
 done:'完成',
};

const STEP_ORDER: Step[] = ['q1','q2','q3','q4','q5','q6'];
const TOTAL = STEP_ORDER.length;

const ACTIVITY_OPTIONS = [
 { id:'indie_dev', label:'独立开发'},
 { id:'engineer', label:'工程师'},
 { id:'designer', label:'设计师'},
 { id:'pm', label:'产品经理'},
 { id:'student', label:'学生'},
 { id:'creator', label:'创作者'},
 { id:'founder', label:'创业者'},
 { id:'other', label:'其他'},
];

const TOPIC_OPTIONS = [
 { id:'tech_detail', label:'技术细节'},
 { id:'recap', label:'产品复盘'},
 { id:'industry', label:'行业观察'},
 { id:'thinking', label:'个人思考'},
 { id:'tutorial', label:'教程'},
 { id:'story', label:'故事'},
 { id:'other', label:'其他'},
];

const GOAL_OPTIONS = [
 { id:'influence', label:'影响力'},
 { id:'network', label:'技术人脉'},
 { id:'income', label:'客户/收入'},
 { id:'record', label:'单纯记录'},
 { id:'job', label:'求职'},
 { id:'authority', label:'行业地位'},
];

const LENGTH_OPTIONS = [
 { id:'short', label:'短句', desc:'< 30 字,1-2 句'},
 { id:'medium', label:'中段', desc:'30-80 字,1-3 段'},
 { id:'long', label:'长段', desc:'> 80 字,多段或 thread'},
];

const TONE_OPTIONS = [
 { id:'serious', label:'严肃'},
 { id:'casual', label:'轻松'},
 { id:'sharp', label:'犀利'},
 { id:'warm', label:'温暖'},
];

const EMOJI_OPTIONS = [
 { id:'never', label:'0'},
 { id:'sometimes', label:'偶尔'},
 { id:'often', label:'经常'},
];

export default function PathCPage() {
 const router = useRouter();
 const [step, setStep] = useState<Step>('q1');
 const [data, setData] = useState<ConversationData>({
 q1_activities: [],
 q1_text:'',
 q2_topics: [],
 q2_text:'',
 q3_goals: [],
 q3_text:'',
 q4_length:'medium',
 q4_tone:'casual',
 q4_emoji:'sometimes',
 q4_text:'',
 q5_text:'',
 q6_text:'',
 });
 const [synthesizing, setSynthesizing] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [showSampleTweets, setShowSampleTweets] = useState(false);

 // Load from localStorage on mount
 useEffect(() => {
 try {
 const stored = localStorage.getItem(STORAGE_KEY);
 if (stored) {
 const parsed = JSON.parse(stored);
 if (parsed.data) setData({ ...data, ...parsed.data });
 if (parsed.step && STEP_ORDER.includes(parsed.step)) setStep(parsed.step);
 }
 } catch {}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Save to localStorage on change
 useEffect(() => {
 try {
 localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, data }));
 } catch {}
 }, [step, data]);

 const update = (patch: Partial<ConversationData>) => {
 setData((d) => ({ ...d, ...patch }));
 };

 const toggleMulti = (
 field:'q1_activities'|'q2_topics'|'q3_goals',
 id: string,
 ) => {
 const arr = data[field];
 update({
 [field]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
 } as any);
 };

 const goNext = () => {
 const i = STEP_ORDER.indexOf(step as any);
 if (i < STEP_ORDER.length - 1) {
 setStep(STEP_ORDER[i + 1]);
 }
 };

 const goPrev = () => {
 const i = STEP_ORDER.indexOf(step as any);
 if (i > 0) {
 setStep(STEP_ORDER[i - 1]);
 }
 };

 const skipOptional = () => {
 if (step ==='q5'|| step ==='q6') {
 goNext();
 }
 };

 const onSynthesize = async () => {
 setStep('synthesizing');
 setSynthesizing(true);
 setError(null);
 try {
 const r = await fetch('/api/voice-dna/synthesize-from-conversation', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify(data),
 });
 if (!r.ok) {
 const j = await r.json().catch(() => ({}));
 throw new Error(j.error || j.message || `HTTP ${r.status}`);
 }
 // Clear localStorage on success
 try {
 localStorage.removeItem(STORAGE_KEY);
 } catch {}
 setStep('done');
 setTimeout(() => router.push('/'), 1500);
 } catch (e) {
 setError(e instanceof Error ? e.message : String(e));
 setStep('q6');
 } finally {
 setSynthesizing(false);
 }
 };

 const onReset = () => {
 if (confirm('确定要清空所有答案重新开始吗?')) {
 try {
 localStorage.removeItem(STORAGE_KEY);
 } catch {}
 setStep('q1');
 setData({
 q1_activities: [],
 q1_text:'',
 q2_topics: [],
 q2_text:'',
 q3_goals: [],
 q3_text:'',
 q4_length:'medium',
 q4_tone:'casual',
 q4_emoji:'sometimes',
 q4_text:'',
 q5_text:'',
 q6_text:'',
 });
 }
 };

 const currentStepNum = STEP_ORDER.indexOf(step as any) + 1;

 return (
 <div className="min-h-screen bg-zinc-50">
 <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
 {/* Top: back + progress (only when not synthesizing/done) */}
 {step !=='synthesizing'&& step !=='done'&& (
 <>
 <div className="mb-3 flex items-center gap-3">
 {step ==='q1'? (
 <Link
 href="/onboarding"className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"aria-label="返回"title="返回">
 <ICON.arrowLeft size={18} />
 </Link>
 ) : (
 <button
 onClick={goPrev}
 className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"aria-label="上一步"title="上一步">
 <ICON.arrowLeft size={18} />
 </button>
 )}
 <div className="flex flex-1 items-center gap-1.5">
 {STEP_ORDER.map((s, i) => (
 <div
 key={s}
 className={`h-1.5 flex-1 rounded-full ${
 i < currentStepNum - 1
 ?'bg-amber-400': i === currentStepNum - 1
 ?'bg-zinc-300':'bg-zinc-200'}`}
 />
 ))}
 </div>
 </div>
 <div className="mb-6 flex items-center justify-between text-xs text-zinc-500">
 <span>
 Step {currentStepNum} / {TOTAL} · {STEP_LABELS[step]}
 </span>
 <button
 onClick={onReset}
 className="inline-flex items-center gap-1 hover:text-red-500"title="清空所有答案重新开始">
 <ICON.refresh size={14} />
 重来
 </button>
 </div>
 </>
 )}

 {/* Step: Q1 */}
 {step ==='q1'&& (
 <div>
 <h1 className="text-xl font-semibold text-zinc-900">
 你现在主要在做什么?
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 可多选。选完再补一句你具体在做的事。
 </p>

 <div className="mt-5">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 方向(可多选)
 </div>
 <div className="flex flex-wrap gap-2">
 {ACTIVITY_OPTIONS.map((opt) => (
 <button
 key={opt.id}
 type="button"onClick={() => toggleMulti('q1_activities', opt.id)}
 className={`rounded-full px-3 py-1.5 text-xs transition ${
 data.q1_activities.includes(opt.id)
 ?'bg-amber-400 text-zinc-900':'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 <div className="mt-4">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 1 句话补充(可选)
 </div>
 <input
 type="text"value={data.q1_text}
 onChange={(e) => update({ q1_text: e.target.value })}
 placeholder="例:前端工程师,业余做独立 SaaS,刚发布第一个产品"className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-amber-400 focus:outline-none"/>
 </div>

 <NavButtons
 onNext={goNext}
 canNext={data.q1_activities.length > 0 || data.q1_text.trim().length > 0}
 />
 </div>
 )}

 {/* Step: Q2 */}
 {step ==='q2'&& (
 <div>
 <h1 className="text-xl font-semibold text-zinc-900">
 你想在 X 上聊什么?
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 可多选。最好具体到话题,不要只写"科技"。
 </p>

 <div className="mt-5">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 话题类型(可多选)
 </div>
 <div className="flex flex-wrap gap-2">
 {TOPIC_OPTIONS.map((opt) => (
 <button
 key={opt.id}
 type="button"onClick={() => toggleMulti('q2_topics', opt.id)}
 className={`rounded-full px-3 py-1.5 text-xs transition ${
 data.q2_topics.includes(opt.id)
 ?'bg-amber-400 text-zinc-900':'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 <div className="mt-4">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 具体话题(可选)
 </div>
 <input
 type="text"value={data.q2_text}
 onChange={(e) => update({ q2_text: e.target.value })}
 placeholder="例:AI agent、RAG 实践、独立开发踩坑"className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-amber-400 focus:outline-none"/>
 </div>

 <NavButtons
 onNext={goNext}
 canNext={data.q2_topics.length > 0 || data.q2_text.trim().length > 0}
 />
 </div>
 )}

 {/* Step: Q3 */}
 {step ==='q3'&& (
 <div>
 <h1 className="text-xl font-semibold text-zinc-900">
 你希望从 X 获得什么?
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 可多选。选最能反映你动机的。
 </p>

 <div className="mt-5">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 目标(可多选)
 </div>
 <div className="flex flex-wrap gap-2">
 {GOAL_OPTIONS.map((opt) => (
 <button
 key={opt.id}
 type="button"onClick={() => toggleMulti('q3_goals', opt.id)}
 className={`rounded-full px-3 py-1.5 text-xs transition ${
 data.q3_goals.includes(opt.id)
 ?'bg-amber-400 text-zinc-900':'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 <div className="mt-4">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 补充(可选)
 </div>
 <input
 type="text"value={data.q3_text}
 onChange={(e) => update({ q3_text: e.target.value })}
 placeholder="例:主要想积累技术人脉,偶尔能接到客户咨询"className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-amber-400 focus:outline-none"/>
 </div>

 <NavButtons
 onNext={goNext}
 canNext={data.q3_goals.length > 0 || data.q3_text.trim().length > 0}
 />
 </div>
 )}

 {/* Step: Q4 */}
 {step ==='q4'&& (
 <div>
 <h1 className="text-xl font-semibold text-zinc-900">
 你的表达风格?
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 选你希望 AI 模仿你写的样子。
 </p>

 <div className="mt-5 space-y-4">
 <SingleChoice
 label="长度"options={LENGTH_OPTIONS}
 value={data.q4_length}
 onChange={(v) => update({ q4_length: v as any })}
 />
 <SingleChoice
 label="语气"options={TONE_OPTIONS}
 value={data.q4_tone}
 onChange={(v) => update({ q4_tone: v as any })}
 />
 <SingleChoice
 label="Emoji 频率"options={EMOJI_OPTIONS}
 value={data.q4_emoji}
 onChange={(v) => update({ q4_emoji: v as any })}
 />
 </div>

 <div className="mt-4">
 <div className="mb-2 text-xs font-medium text-zinc-700">
 补充(可选)
 </div>
 <input
 type="text"value={data.q4_text}
 onChange={(e) => update({ q4_text: e.target.value })}
 placeholder="例:少用术语,口语化,像跟朋友聊天"className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-amber-400 focus:outline-none"/>
 </div>

 <NavButtons onNext={goNext} canNext={true} />
 </div>
 )}

 {/* Step: Q5 */}
 {step ==='q5'&& (
 <div>
 <h1 className="text-xl font-semibold text-zinc-900">
 你欣赏什么样的写作者?
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 可选。可以是人名、一句话、或者一段描述。
 </p>
 <p className="mt-1 text-xs text-zinc-400">
 例:"我希望像跟朋友聊天一样"/"@paulg 的风格"/"不端着但有内容"</p>

 <div className="mt-5">
 <textarea
 value={data.q5_text}
 onChange={(e) => update({ q5_text: e.target.value })}
 rows={5}
 placeholder="可以多行,写你的真实想法..."className="w-full resize-y rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-6 focus:border-amber-400 focus:outline-none"/>
 </div>

 <NavButtons
 onNext={goNext}
 onSkip={skipOptional}
 canNext={true}
 showSkip
 />
 </div>
 )}

 {/* Step: Q6 */}
 {step ==='q6'&& (
 <div>
 <h1 className="text-xl font-semibold text-zinc-900">
 如果现在发一条 X 推文,你会发什么?
 </h1>
 <p className="mt-2 text-sm text-zinc-500">
 可选,但强烈推荐 — 这是 AI 看到你真实声音的最佳信号。
 </p>

 <div className="mt-5">
 <textarea
 value={data.q6_text}
 onChange={(e) => update({ q6_text: e.target.value })}
 rows={5}
 placeholder="随便写一条你自己会发的推文。也可以是系列推文的第一条..."className="w-full resize-y rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-6 focus:border-amber-400 focus:outline-none"/>
 </div>

 <div className="mt-3">
 <button
 onClick={() => setShowSampleTweets(!showSampleTweets)}
 className="text-xs text-zinc-900 hover:text-zinc-900">
 {showSampleTweets ?'收起':'展开'} 3 个写作模板的样例参考
 </button>
 {showSampleTweets && (
 <div className="mt-2 space-y-2">
 {listVoiceTemplates()
 .filter((t) => ['operator','teacher','storyteller'].includes(t.id))
 .map((t) => (
 <div
 key={t.id}
 className="rounded-lg bg-zinc-50 p-3 text-xs">
 <div className="mb-1 font-medium text-zinc-600">
 {t.name}
 </div>
 <div className="whitespace-pre-wrap text-zinc-700">
 {t.sampleTweets[0]}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {error && (
 <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
 {error}
 </div>
 )}

 <div className="mt-6 flex items-center justify-end gap-2">
 {data.q6_text.trim().length === 0 && (
 <button
 onClick={onSynthesize}
 className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
 跳过,直接合成
 </button>
 )}
 <button
 onClick={onSynthesize}
 disabled={synthesizing}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 <ICON.wand size={14} />
 {synthesizing ?'合成中…':'合成我的 DNA'}
 </button>
 </div>
 </div>
 )}

 {/* Synthesizing state */}
 {step ==='synthesizing'&& (
 <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
 <div className="mb-2 inline-flex justify-center">
 <ICON.wand size={32} className="animate-pulse text-zinc-900"/>
 </div>
 <div className="text-sm text-zinc-700">
 正在基于你的 6 个回答合成声音 DNA...
 </div>
 <div className="mt-3 text-xs text-zinc-400">~10 秒</div>
 </div>
 )}

 {/* Done state */}
 {step ==='done'&& (
 <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
 <div className="mb-2 inline-flex justify-center">
 <ICON.check size={32} className="text-emerald-600"/>
 </div>
 <div className="text-sm font-medium text-emerald-900">
 声音 DNA 已就绪
 </div>
 <div className="mt-2 text-xs text-emerald-700">
 跳转到主界面...
 </div>
 </div>
 )}
 </div>
 </div>
 );
}

function NavButtons({
 onPrev,
 onNext,
 onSkip,
 canNext,
 showSkip,
}: {
 onPrev?: () => void;
 onNext: () => void;
 onSkip?: () => void;
 canNext: boolean;
 showSkip?: boolean;
}) {
 return (
 <div className="mt-6 flex items-center justify-end gap-2">
 {showSkip && onSkip && (
 <button
 onClick={onSkip}
 className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
 跳过
 </button>
 )}
 <button
 onClick={onNext}
 disabled={!canNext}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-amber-500 disabled:opacity-50">
 下一步
 <ICON.arrowRight size={14} />
 </button>
 </div>
 );
}

function SingleChoice<T extends string>({
 label,
 options,
 value,
 onChange,
}: {
 label: string;
 options: Array<{ id: T; label: string; desc?: string }>;
 value: T;
 onChange: (v: T) => void;
}) {
 return (
 <div>
 <div className="mb-2 text-xs font-medium text-zinc-700">
 {label}
 </div>
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
 {options.map((opt) => (
 <button
 key={opt.id}
 type="button"onClick={() => onChange(opt.id)}
 className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition ${
 value === opt.id
 ?'border-amber-400 bg-zinc-50':'border-zinc-200 bg-white hover:border-zinc-300'}`}
 >
 <div className="text-sm font-medium text-zinc-900">
 {opt.label}
 </div>
 {opt.desc && (
 <div className="text-xs text-zinc-500">
 {opt.desc}
 </div>
 )}
 </button>
 ))}
 </div>
 </div>
 );
}
