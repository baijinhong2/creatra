/**
 * 5 个 voice 模板,目标客群:科技 / 知识 / 独立开发者
 * 每个模板在 3 个轴上(内容 / 钩子 / 语气)只占 1 个位置,互相强差异化
 *
 * 样例推文是预制的、匿名的范本,不是真实名人推文
 */

export type VoiceTemplateId ='operator'|'provocateur'|'teacher'|'storyteller'|'curator';

export type VoiceTemplate = {
 id: VoiceTemplateId;
 name: string;
 nameEn: string;
 tagline: string; // 1 行描述
  axes: {
    content: string; // 'project_progress' | 'opinion' | 'knowledge' | 'personal' | 'curation'
    hook: string;    // 'data' | 'contrarian' | 'question' | 'scene' | 'list'
    tone: string;    // 'dry' | 'sharp' | 'explainer' | 'warm' | 'efficient'
  };
 sampleTweets: string[]; // 3 条范本
 features: {
 sentence_length: { mean: number; p50: number; p90: number };
 structure: { single_sentence: number; multi_sentence: number; list: number; question: number; dialogue: number };
 emoji_rate: number;
 punctuation: { exclamation: number; question: number; ellipsis: number; linebreak: number };
 vocabulary: { top_words: string[]; domain_terms: string[]; avoids: string[] };
 tone: { casual: number; professional: number; humorous: number; serious: number; warm: number };
 hooks: { data_first: number; contrarian: number; question: number; story: number; list: number };
 topics: string[];
 signature_patterns: string[];
 language:'zh'|'en'|'mixed';
 };
};

export const VOICE_TEMPLATES: Record<VoiceTemplateId, VoiceTemplate> = {
 // A. 实操型: 内容=项目进展,钩子=数据,语气=干具体
 operator: {
 id:'operator',
 name:'实操型',
 nameEn:'Build-in-Public Operator',
 tagline:'用数据和结果说话,适合独立开发者和 SaaS 创业者',
 axes: {
 content:'project_progress',
 hook:'data',
 tone:'dry',
 },
 sampleTweets: ["Day 47 of building Koi.\n\nMRR: $2.1k → $3.4k (+62%)\nChurn: 8% → 3%\n\nChanged pricing from $9 → $19. Here's what happened ↓","Week 6 metrics:\n\n• Signups: 412 (last week 287)\n• Activation rate: 31% (was 22%)\n• 7-day retention: 18%\n\nThe only thing I changed: shorter onboarding. Removed 2 steps.","Shipped the search feature today.\n\nBefore: users scroll 3+ pages\nAfter: average search 1.2 queries/session\n\nCode: 240 lines. Time: 6 hours. Mostly SQL indexes.",
 ],
 features: {
 sentence_length: { mean: 22, p50: 18, p90: 38 },
 structure: { single_sentence: 0.20, multi_sentence: 0.50, list: 0.25, question: 0.05, dialogue: 0.00 },
 emoji_rate: 0.00,
 punctuation: { exclamation: 0.02, question: 0.05, ellipsis: 0.05, linebreak: 0.85 },
 vocabulary: {
 top_words: ['shipped','MRR','users','churn','retention','week','day','code','feature','change'],
 domain_terms: ['MRR','ARR','churn','retention','activation','DAU','WAU'],
 avoids: ['excited','amazing','incredible','synergy','leverage'],
 },
 tone: { casual: 0.55, professional: 0.35, humorous: 0.05, serious: 0.05, warm: 0.00 },
 hooks: { data_first: 0.70, contrarian: 0.10, question: 0.05, story: 0.05, list: 0.10 },
 topics: ['项目复盘','数据','ship log','商业指标','技术细节'],
 signature_patterns: ['以"Day X of building Y"或"Week X metrics"开头','always has at least one specific number (MRR, %, days)',"ends with \"Here's what happened\"/ \"Code: X lines\"",'lists separated by single line breaks',
 ],
 language:'en',
 },
 },

 // B. 观点型: 内容=行业观点,钩子=反共识,语气=锋利
 provocateur: {
 id:'provocateur',
 name:'观点型',
 nameEn:'Hot Take Provocateur',
 tagline:'反共识观点,适合有立场的行业评论员',
 axes: {
 content:'opinion',
 hook:'contrarian',
 tone:'sharp',
 },
 sampleTweets: ["Hot take: most AI coding tools solve the wrong problem.\n\nThe hard part isn't writing code. It's deciding what to build.\n\nStop optimizing the easy part.",'Unpopular opinion: 90% of"indie hackers"should just get a job.\n\nNot because indie is bad. Because most people don\'t have the 18-month runway to find product-market fit.\n\nSelf-funding is a luxury, not a virtue.','Most startup advice is written by people who already won.\n\n"Launch fast"works when you have audience.\n"Build in public"works when you have something to show.\n\nCold-starting is a different game entirely.',
 ],
 features: {
 sentence_length: { mean: 18, p50: 14, p90: 32 },
 structure: { single_sentence: 0.30, multi_sentence: 0.40, list: 0.05, question: 0.15, dialogue: 0.10 },
 emoji_rate: 0.00,
 punctuation: { exclamation: 0.00, question: 0.15, ellipsis: 0.05, linebreak: 0.40 },
 vocabulary: {
 top_words: ['actually','most','people','problem','build','ship','wrong','right','think','reason'],
 domain_terms: ['product-market fit','moat','leverage','distribution','positioning'],
 avoids: ['excited to share','thrilled to announce','amazing journey'],
 },
 tone: { casual: 0.40, professional: 0.40, humorous: 0.05, serious: 0.15, warm: 0.00 },
 hooks: { data_first: 0.10, contrarian: 0.70, question: 0.10, story: 0.05, list: 0.05 },
 topics: ['行业观察','first principles','反共识','决策框架','行业批评'],
 signature_patterns: ['starts with"Hot take:"/"Unpopular opinion:"/"Most X are Y"','one bold claim + 2-3 sentences defending it','short, punchy sentences (avg < 20 chars)','ends with imperative ("Stop optimizing X")',
 ],
 language:'en',
 },
 },

 // C. 教程型: 内容=知识,钩子=问句→答案,语气=解释
 teacher: {
 id:'teacher',
 name:'教程型',
 nameEn:'Patient Teacher',
 tagline:'教程式拆解,适合知识博主和开发者布道师',
 axes: {
 content:'knowledge',
 hook:'question',
 tone:'explainer',
 },
 sampleTweets: ["How does Next.js App Router actually work?\n\nAfter 6 months of building with it:\n\n1. Server Components run on the server by default. You get a JSON-like payload sent to the client.\n2. Streaming + Suspense means you can render parts of the page while data is still loading.\n3. Caching is automatic at the route level — revalidate() controls it.\n\nThe mental model: every route is a tiny RPC + stateful cache.","TIL: `useMemo` doesn't help unless you're passing the value to a child component.\n\nI was wrapping expensive calculations in useMemo for years. Useless.\n\nReact only re-runs the child if props change. The parent re-renders either way.\n\nThe fix: move useMemo to the child, or use React.memo.","Stop using `useEffect` for derived state.\n\nIf your effect sets state based on props/state, you're doing it wrong.\n\nExample:\n❌ useEffect(() => setFullName(...), [first, last])\n✅ const fullName = first +''+ last\n\nuseEffect is for side effects (subscriptions, timers, fetch).",
 ],
 features: {
 sentence_length: { mean: 28, p50: 24, p90: 50 },
 structure: { single_sentence: 0.10, multi_sentence: 0.55, list: 0.30, question: 0.05, dialogue: 0.00 },
 emoji_rate: 0.00,
 punctuation: { exclamation: 0.01, question: 0.10, ellipsis: 0.02, linebreak: 0.50 },
 vocabulary: {
 top_words: ['use','component','state','render','useEffect','function','props','cache','data','server'],
 domain_terms: ['React','Next.js','TypeScript','PostgreSQL','API','state management'],
 avoids: ['amazing','incredible','just','simply','easy'],
 },
 tone: { casual: 0.40, professional: 0.50, humorous: 0.05, serious: 0.05, warm: 0.00 },
 hooks: { data_first: 0.05, contrarian: 0.10, question: 0.60, story: 0.05, list: 0.20 },
 topics: ['how-to 教程','技术原理','best practices','代码片段','mental models'],
 signature_patterns: ['starts with"How does X work?"or"TIL:"or"Stop using X"','numbered list (1. 2. 3.) with concrete code/examples','uses ❌ ✅ to mark wrong/right approaches','ends with"the mental model:"or"the fix:"',
 ],
 language:'en',
 },
 },

 // D. 故事型: 内容=个人经历,钩子=场景/脆弱,语气=温暖
 storyteller: {
 id:'storyteller',
 name:'故事型',
 nameEn:'Storyteller Confessional',
 tagline:'个人经历建立情感连接,适合想用故事吸粉的创作者',
 axes: {
 content:'personal',
 hook:'scene',
 tone:'warm',
 },
 sampleTweets: ["I almost killed Koi last Tuesday.\n\n3 months of weekends. $0 revenue. Wife:'when are you going to stop?'\n\nHere's why I didn't:\n\nI had a list of 47 paying users from beta. Not a vanity metric — they paid real money for something I built in my basement.\n\nThat's not a side project. That's proof of life.","The first paying customer of my last startup was a stranger in Berlin.\n\nShe DM'd me:'I used your tool to ship a side project in 2 days.'\n\nI cried at my desk. Not because of the money ($29). Because someone used what I built, in a way I never imagined.\n\nBuild for those moments.","Confession: I deleted 3 projects in 2025.\n\nNone of them were'bad.'All of them had users.\n\nI killed them because I wasn't learning anymore.\n\nStagnation is worse than failure. At least failure teaches you something.",
 ],
 features: {
 sentence_length: { mean: 24, p50: 20, p90: 42 },
 structure: { single_sentence: 0.20, multi_sentence: 0.60, list: 0.10, question: 0.05, dialogue: 0.05 },
 emoji_rate: 0.00,
 punctuation: { exclamation: 0.03, question: 0.05, ellipsis: 0.05, linebreak: 0.55 },
 vocabulary: {
 top_words: ['I','me','my','wife','project','build','months','first','time','learned'],
 domain_terms: ['side project','indie hacker','founder','beta users','first customer'],
 avoids: ['excited','thrilled','amazing','incredible journey','rockstar'],
 },
 tone: { casual: 0.50, professional: 0.10, humorous: 0.05, serious: 0.10, warm: 0.25 },
 hooks: { data_first: 0.05, contrarian: 0.05, question: 0.05, story: 0.80, list: 0.05 },
 topics: ['个人复盘','脆弱时刻','first customer','side project 历程','人生感悟'],
 signature_patterns: ['starts with a vivid scene ("I almost killed X"/"Confession:")','includes a quote or dialogue ("Wife: example quote")','middle section: the conflict / what almost stopped you','ends with a"here\'s what I learned"or"build for Y"',
 ],
 language:'en',
 },
 },

 // E. 策展型: 内容=别人的好东西,钩子=列表,语气=高效低自我
 curator: {
 id:'curator',
 name:'策展型',
 nameEn:'Industry Curator',
 tagline:'汇总工具/文章/推文,适合想做"信息枢纽"的人',
 axes: {
 content:'curation',
 hook:'list',
 tone:'efficient',
 },
 sampleTweets: ["5 AI tools I 10x'd my workflow with this week:\n\n1. Cursor 0.4X — agent mode works\n2. Raycast AI — commands across every app\n3. Granola — meeting notes that actually summarize\n4. Perplexity Pro — still the best research starter\n5. Fathom Analytics — self-hosted, finally simple\n\n[1-line each, real review]","3 threads on vibe coding I wish I'd read earlier:\n\n1. @levelsio — the original thread, 18 months ago\n2. @marc_louvion — 1-week case study\n3. @tdinh_me — the 1-minute TL;DR for non-builders\n\nBookmarking for my own team onboarding.","The 5 newsletters I actually open (out of 47 subscribed):\n\n1. Lenny's — product management depth\n2. Refactoring — engineering culture, weekly\n3. Web3 is Going Great — for context on chaos\n4. Inbox 100 — long-form essays\n5. The Pragmatic Engineer — engineering management\n\nThe others? Filing for later. Never later.",
 ],
 features: {
 sentence_length: { mean: 16, p50: 14, p90: 28 },
 structure: { single_sentence: 0.15, multi_sentence: 0.20, list: 0.55, question: 0.00, dialogue: 0.10 },
 emoji_rate: 0.00,
 punctuation: { exclamation: 0.01, question: 0.02, ellipsis: 0.02, linebreak: 0.70 },
 vocabulary: {
 top_words: ['X','best','use','tools','actually','week','best','open','subscribed','list'],
 domain_terms: ['newsletters','threads','tools','case study','review','guide'],
 avoids: ['amazing','must-have','game-changer','revolutionary','you need to'],
 },
 tone: { casual: 0.50, professional: 0.40, humorous: 0.02, serious: 0.05, warm: 0.03 },
 hooks: { data_first: 0.05, contrarian: 0.05, question: 0.05, story: 0.00, list: 0.85 },
 topics: ['工具汇总','newsletter 推荐','thread 整理','资源合集','信息策展'],
 signature_patterns: ['starts with a number + noun ("5 tools"/"3 threads"/"The 5 newsletters")','numbered list (1. 2. 3.) with 1-2 line reviews each','low ego — never"I found"/"I made", just the items','ends with"[1-line each, real review]"or similar',
 ],
 language:'en',
 },
 },
};

/**
 * 3 个轴的中文显示名。enum 值仍为英文(用于 DB / prompt),
 * UI 渲染时通过这些映射表拿到中文标签。
 */
export const CONTENT_LABELS: Record<string, string> = {
 project_progress:'项目进展',
 opinion:'行业观点',
 knowledge:'知识',
 personal:'个人经历',
 curation:'信息策展',
};

export const HOOK_LABELS: Record<string, string> = {
 data:'数据',
 contrarian:'反共识',
 question:'问句',
 scene:'场景',
 list:'列表',
};

export const TONE_LABELS: Record<string, string> = {
 dry:'干练',
 sharp:'锋利',
 explainer:'解释型',
 warm:'温暖',
 efficient:'高效',
};

/** Get all templates as a list (for UI iteration) */
export function listVoiceTemplates(): VoiceTemplate[] {
 return Object.values(VOICE_TEMPLATES);
}

/** Look up by id, returns null if not found */
export function getVoiceTemplate(id: string): VoiceTemplate | null {
 return (VOICE_TEMPLATES as Record<string, VoiceTemplate>)[id] ?? null;
}
