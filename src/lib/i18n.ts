/**
 * i18n for creatra (社交运营顾问)。
 *
 * 单一语言:中文。所有 key 直接返回 zh 字符串。
 * 保留 dict 是为了集中管理文案,方便后续 grep / 修改。
 *
 * Usage:
 *   const text = t('sidebar.newChat');
 */

const dict = {
  // ── App identity ──────────────────────────────────────────
  'app.name':           'creatra',
  'app.tagline':        'X 增长 agent',
  'app.version':        '本地版 v0.2',
  'app.taglineShort':   'X 运营合伙人',

  // ── Sidebar ──────────────────────────────────────────────
  'sidebar.newChat':    '新对话',
  'sidebar.recent':     '最近对话',
  'sidebar.refresh':    '刷新',
  'sidebar.emptyChats': '还没有对话 — 点上面开一个',
  'sidebar.sources':    '数据源',

  // ── Mode picker ──────────────────────────────────────────
  'mode.label':         '交互模式',
  'mode.auto.label':    '自动',
  'mode.auto.desc':     'agent 根据话题自动切换专家/助手',
  'mode.expert.label':  '专家',
  'mode.expert.desc':   '耐心导师,带选项引导,解释"为什么"',
  'mode.assistant.label': '助手',
  'mode.assistant.desc':  '高效执行,直接给成品,不铺垫',
  'mode.decided.expert':   '本轮:专家',
  'mode.decided.assistant': '本轮:助手',

  // ── Top bar ──────────────────────────────────────────────
  'topbar.chat':        '对话中',
  'topbar.newChat':     '新对话',

  // ── Empty state ──────────────────────────────────────────
  'empty.greeting':     '你好 — 我是你的 X 运营合伙人。',
  'empty.body':         '我专门做 X 账号运营,9 项核心能力 + 2 个通用工具:定位挖掘 · 用户名/bio · 对标博主 · 内容策略 · 每日推文 · 评论回复 · 竞品互动 · 数据分析 · 沉淀梳理;外加搜全网热点、找推文配图。挑一个起点,或者直接说要啥。',
  'empty.skillsHint':   '所有能力 →',

  // ── Suggested prompts (11 项能力入口) ──────────────────────
  'prompt.positioning.title': '从 0 定位账号',
  'prompt.positioning.body':  '我想搞个 X 账号,但不知道做啥方向。帮我挖一下。',
  'prompt.brand.title':       '取名 + bio',
  'prompt.brand.body':        '我的定位是 X,帮我取个用户名 + 写个 bio + 想个头像方向。',
  'prompt.creators.title':    '找对标博主',
  'prompt.creators.body':     '基于我的定位,推荐 10 个我应该关注的创作者(分头部 / 成长中 / 新兴三档)。',
  'prompt.strategy.title':    '内容更新策略',
  'prompt.strategy.body':     '结合对标和我的项目,给我 3 个内容方向 + 更新频次/时段/形式的策略。',
  'prompt.daily.title':       '今天发什么',
  'prompt.daily.body':        '今天发什么推文?给我 3 条直接可发的,带配图说明。',
  'prompt.topics.title':      '今日选题',
  'prompt.topics.body':       '给我 5-10 个今天可以写的 X 推文选题,基于最近我关注的内容方向 + 当前热点。每个选题一句话角度 + 为什么值得写。',
  'prompt.xTrends.title':     '今日热点',
  'prompt.xTrends.body':      '用 reddit_search 抓 Reddit 上最近 24 小时跟我所在领域相关的热门讨论(因为 X 搜索在 datacenter IP 上不稳,改走 Reddit 公开 API,403 时工具会自动 fallback 到 web_search + site:reddit.com)。先从我 voice DNA 的关键词/方向里挑 3-5 个搜索词(用 OR 串起来,例如 "LLM agents OR autonomous agents"),每个搜最近 24h 内,按 hot 排序,挑出 score 最高的,聚类成 5-8 个热点话题。每个热点:一句话总结 + 1-2 条代表性 post 链接(r/xxx + url) + 我可以怎么蹭的角度。**只用 reddit_search,别调 twitter_***——X 搜索今天早晨拿不到。',
  'prompt.creatorFeed.title': '看对标动态',
  'prompt.creatorFeed.body':  '用 list_creators 拿到我关注的博主列表(按 weight 排,默认前 5 个),然后对每个博主调 twitter_get_user_tweets(username=handle, count=10) 抓他们最近的推文(默认每个 10 条)。把所有推文按时间线倒序排(最新在前),每条给我:博主 handle + 推文时间 + 核心观点(一句话) + 互动数(赞转评) + 推文 URL。如果某条下面有重要评论,可以再用 twitter_get_tweet_replies(tweet_id) 看 5-10 条主评论,提炼分歧/共鸣。**默认 10 条/博主**——如果我说"更多"或"再来 10 条",就对同一批博主再调一次 twitter_get_user_tweets(count=20) 取第 11-20 条。注意:数据量可能很大,分批慢慢给,不要一次塞太多导致超时。**需要 X cookies** (Sources 面板里的 x.auth_token + x.ct0)。',
  'prompt.replies.title':     '看评论 / 写回复',
  'prompt.replies.body':      '帮我看我最近推文下面的评论,哪些值得回,你给我直接能发的回复。',
  'prompt.engage.title':      '竞品互动',
  'prompt.engage.body':       '看 @xxx 最近发了啥,挑值得我评论的去互动,给我直接能发的评论。',
  'prompt.analytics.title':   '我的数据',
  'prompt.analytics.body':    '看我最近 20 条推文表现,哪些火、哪些没火、下周该调整啥。',
  'prompt.insights.title':    '沉淀 / 反思',
  'prompt.insights.body':     '我做了个项目 / 我有个想法,你帮我反推+引导+归纳,沉淀成结构化内容,以后写推文能用上。',
  'prompt.searchNews.title':  '搜全网热点',
  'prompt.searchNews.body':   '帮我搜一下最近 [赛道] 的新闻/热点/趋势,要链接 + 一句话总结。',
  'prompt.findImage.title':   '找配图',
  'prompt.findImage.body':    '我想要一张 [描述] 的图,帮我从网上找几个候选 + 链接。',

  // ── Onboarding gate banner ───────────────────────────────
  'gate.title':             '先花 1 分钟设置你的声音 DNA',
  'gate.subtitle':          '让 agent 学你说话,写出来更像你。',
  'gate.cta':               '开始',
  'gate.dismiss':           '不再提示',
  'gate.alreadySet':        '你已经设置过声音 DNA',

  // ── Onboarding index ─────────────────────────────────────
  'onb.subtitle':           '让我学你说话,之后推文更像你写的。',
  'onb.pathA.title':        '我有内容',
  'onb.pathA.subtitle':     '从推文、博客、Newsletter 提取',
  'onb.pathA.time':         '~10-30 秒',
  'onb.template.title':     '直接选模板',
  'onb.template.subtitle':  '5 个写作模板,选 1 个就走',
  'onb.template.time':      '~30 秒',
  'onb.template.recommended':'推荐',
  'onb.pathB.title':        '我想用某博主的风格',
  'onb.pathB.subtitle':     '粘 1-3 个对标账号',
  'onb.pathB.time':         '~1-2 分钟',
  'onb.pathC.title':        '从 0 开始 / 聊聊自己',
  'onb.pathC.subtitle':     'AI 跟我聊聊,帮我找出声音',
  'onb.pathC.time':         '~5-10 分钟',
  'onb.skip':               '跳过,稍后设置',

  // ── Path A (paste handle) ────────────────────────────────
  'pathA.title':            '粘你的 X 账号',
  'pathA.subtitle':         '拉最近 25 条原创推文,提取你的风格。',
  'pathA.placeholder':      '@your_handle',
  'pathA.hint':             '需要 X cookies 配好;没有的话,试试下面的"粘文字"。',
  'pathA.extract':          '提取',
  'pathA.pasteLink':        '粘我自己的文字',
  'pathA.pasteHint':        '博客、Newsletter、邮件、推文都行,不需要 X cookies',

  // ── Path A paste ────────────────────────────────────────
  'pathAPaste.title':       '粘你的文字',
  'pathAPaste.subtitle':    '至少 200 字,我拆 5+ 段提取你的风格。',
  'pathAPaste.placeholder': '在这里粘贴你的内容',
  'pathAPaste.sources':     '内容来源',
  'pathAPaste.extract':     '提取 DNA',
  'pathAPaste.back':        '返回',

  // ── Path B (paste handles) ───────────────────────────────
  'pathB.title':            '粘 1-3 个对标账号',
  'pathB.subtitle':         '拉每人 25 条,合成你的 DNA。',
  'pathB.placeholder':      '@handle1, @handle2, @handle3',
  'pathB.hint':             '需要 X cookies;没有的话试试其他路径。',
  'pathB.extract':          '提取 DNA',

  // ── Path B recommend (quiz) ─────────────────────────────
  'pathBRec.title':         '让我推荐对标',
  'pathBRec.pickOne':       '选 1-3 个,我拉他们的推文合成你的 DNA:',
  'pathBRec.redo':          '重做 quiz',
  'pathBRec.recommend':     '推荐',
  'pathBRec.next':          '下一步',
  'pathBRec.back':          '上一步',
  'pathBRec.q.direction':   '你想看什么方向的内容?',
  'pathBRec.q.style':       '你欣赏什么风格?',
  'pathBRec.q.language':    '主要语言?',
  'pathBRec.opt.saas':      '独立开发 / SaaS',
  'pathBRec.opt.ai':        'AI / 人工智能',
  'pathBRec.opt.tools':     '开发者工具',
  'pathBRec.opt.content_creation': '内容创作 / 设计',
  'pathBRec.opt.casual':    '不端着 / 聊得来',
  'pathBRec.opt.professional': '干具体 / 商务感',
  'pathBRec.opt.humorous':  '幽默 / 段子手',
  'pathBRec.opt.en':        '英文',
  'pathBRec.opt.zh':        '中文',

  // ── Path C (6 questions) ────────────────────────────────
  'pathC.title':            '跟我聊聊',
  'pathC.subtitle':         'AI 跟我聊聊,帮我找出声音',
  'pathC.q1.label':         '方向(可多选)',
  'pathC.q1.hint':          '选完再补一句你具体在做的事。',
  'pathC.q1.placeholder':  '例:前端工程师,业余做独立 SaaS,刚发布第一个产品',
  'pathC.q2.label':         '话题类型(可多选)',
  'pathC.q2.hint':          '最好具体到话题,不要只写"科技"。',
  'pathC.q2.placeholder':  '例:AI agent、RAG 实践、独立开发踩坑',
  'pathC.q3.label':         '目标(可多选)',
  'pathC.q3.placeholder':  '例:主要想积累技术人脉,偶尔能接到客户咨询',
  'pathC.q4.hint':          '选你希望 AI 模仿你写的样子。',
  'pathC.q4.placeholder':  '例:少用术语,口语化,像跟朋友聊天',
  'pathC.q5.hint':          '可选。可以是人名、一句话、或者一段描述。',
  'pathC.q5.placeholder':  '可以多行,写你的真实想法...',
  'pathC.q6.hint':          '可选,但强烈推荐 — 这是 AI 看到你真实声音的最佳信号。',
  'pathC.q6.placeholder':  '随便写一条你自己会发的推文。也可以是系列推文的第一条...',
  'pathC.samples.collapse': '收起',
  'pathC.samples.expand':   '展开 3 个写作模板的样例参考',
  'pathC.skip':             '跳过',
  'pathC.next':             '下一步',
  'pathC.prev':             '上一步',
  'pathC.reset':            '重来',
  'pathC.synthesizing':     '正在基于你的 6 个回答合成声音 DNA...',
  'pathC.done':             '声音 DNA 已就绪',
  'pathC.synthesize':       '合成我的 DNA',
  'pathC.skipAndSynthesize':'跳过,直接合成',
  'pathC.activity.indie_dev':    '独立开发',
  'pathC.activity.engineer':     '工程师',
  'pathC.activity.designer':     '设计师',
  'pathC.activity.pm':           '产品经理',
  'pathC.activity.student':      '学生',
  'pathC.activity.creator':      '创作者',
  'pathC.activity.founder':      '创业者',
  'pathC.activity.other':        '其他',
  'pathC.topic.tech_detail':     '技术细节',
  'pathC.topic.recap':           '产品复盘',
  'pathC.topic.industry':        '行业观察',
  'pathC.topic.thinking':        '个人思考',
  'pathC.topic.tutorial':        '教程',
  'pathC.topic.story':           '故事',
  'pathC.topic.other':           '其他',
  'pathC.goal.influence':        '影响力',
  'pathC.goal.network':          '技术人脉',
  'pathC.goal.income':           '客户/收入',
  'pathC.goal.record':           '单纯记录',
  'pathC.goal.job':              '求职',
  'pathC.goal.authority':        '行业地位',

  // ── Template page ────────────────────────────────────────
  'template.title':         '选一个写作模板',
  'template.tagline':       '每个模板 3 个轴各占 1 个位置。',
  'template.samples':       '样例',
  'template.collapse':      '收起',
  'template.expand':        '查看样例',
  'template.pick':          '选这个',
  'template.saving':        '保存中…',

  // ── Menu / user pill ─────────────────────────────────────
  'menu.voiceDna':          '声音 DNA',
  'menu.voiceDna.hint':     '查看 / 重新设置你的写作风格',
  'menu.insights':          '我的沉淀',
  'menu.memories':          'Agent 记忆',
  'menu.showToolTrace':     '显示工具调用',
  'menu.showToolTrace.hint':'关掉只看 agent 的最终回复;开起来可以看到 remember_preference / web_search 等工具的调用过程(调试用)',
  'menu.userMenuAria':      '账号菜单',
  'menu.logout':            '登出',
  'menu.login':             '登录',
  'menu.display':           '显示',
  'menu.theme':             '外观',
  'menu.theme.light':       '明亮',
  'menu.theme.dark':        '暗色',
  'menu.language':          '界面语言',

  // ── Topbar / messages ────────────────────────────────────
  'topbar.stop':            '停止生成',
  'topbar.regenerate':      '重新生成',
  'topbar.placeholder':     '问点啥,Enter 发送,Shift+Enter 换行',
  'topbar.placeholder.busy':'agent 跑着呢…',

  // ── Composer ─────────────────────────────────────────────
  'composer.attachment':    '附件',
  'composer.send':          '发送',
  'composer.model':         '模型',

  // ── Topics / Health / Inbox ──────────────────────────────
  'topics.title':           '今日选题',
  'topics.subtitle':        '基于你的定位 + 热点 + 历史表现',
  'topics.loading':         '正在扫描热点、写作风格、历史表现…',
  'topics.regenerate':      '重新生成',
  'topics.empty':           '还没生成选题。点上面的按钮来一波。',
  'topics.draft':           '用这个写',
  'health.title':           '账号健康',
  'health.subtitle':        '你的 X 账号 28 天健康度',
  'health.regenerate':      '重新生成',
  'health.score':           '健康度',
  'health.empty':           '还没有数据。配好 X cookies 拉一波。',
  'inbox.title':            '互动收件箱',
  'inbox.subtitle':         '需要回复的评论 + 提到你',
  'inbox.regenerate':       '重新生成',
  'inbox.redraft':          '重新生成',
  'inbox.empty':            '没有互动。先去发几条。',
  'inbox.handleHint':       '用 cookie 模式拉数据,先填你的 X 账号。',

  // ── Login / register modal ───────────────────────────────
  'login.title':            '登录',
  'login.subtitle':         '登录你的社交运营顾问',
  'login.email':            '邮箱',
  'login.emailPh':          'you@example.com',
  'login.password':         '密码',
  'login.passwordPh':       '至少 6 位',
  'login.submit':           '登录',
  'login.submitBusy':       '处理中…',
  'login.toRegister':       '注册一个',
  'login.noAccount':        '没账号?',
  'login.error':            '登录失败',
  'register.title':         '创建账号',
  'register.subtitle':      '创建账号,开始用',
  'register.nickname':      '昵称(可选)',
  'register.nicknamePh':    '随便起个名字',
  'register.submit':        '注册并登录',
  'register.toLogin':       '去登录',
  'register.hasAccount':    '已经有账号了?',

  // ── Cross post ───────────────────────────────────────────
  'cp.title':               '跨平台发布',
  'cp.subtitle':            '把这条改写成其他平台格式',
  'cp.platforms':          '目标平台',
  'cp.regenerate':          '重新生成',
  'cp.copy':                '复制',
  'cp.copied':              '已复制',

  // ── Misc ─────────────────────────────────────────────────
  'app.error':              '出错了',
  'app.retry':              '重试',
  'app.close':              '关闭',
  'app.cancel':             '取消',
  'app.confirm':            '确定',
  'app.delete':             '删除',
  'app.save':               '保存',
  'app.saving':             '保存中…',
  'app.saved':              '已保存',

  // ── Sidebar extras (added during simplify) ────────────────
  'sidebar.insights':       '沉淀',
  'sidebar.memories':       'Agent 记忆',

  // ── Time / meta ───────────────────────────────────────────
  'meta.justNow':           '刚刚',

  // ── Insights panel ───────────────────────────────────────
  'insights.title':         '我的沉淀',
  'insights.empty':         '还没有沉淀。聊天中遇到值得记的,agent 会自动存。',
  'insights.btn.copy':      '复制',
  'insights.btn.copied':    '已复制',
  'insights.btn.delete':    '删除',
  'insights.btn.deleteAll': '清空全部',
  'insights.btn.download':  '下载',
  'insights.confirmDelete': '确定要删除这条沉淀吗?',
  'insights.exportFilename':'沉淀',

  // ── Memories panel ───────────────────────────────────────
  'memories.title':         'Agent 记忆',
  'memories.empty':         'agent 还没记东西。当你在聊天中确认偏好时,会自动存。',
  'memories.notSet':        '未设置',
  'memories.secret':        '(私密)',
  'memories.count':         '{n} 项',
  'memories.confirmDelete': '确定要删除这条记忆吗?',

  // ── Source / API key panel ───────────────────────────────
  'source.redditHandle.label': 'Reddit 用户名',
  'source.redditHandle.hint':  '填你的 Reddit 用户名(不带 u/)。可选 — 不填也能用 reddit_search 找全网热点。填了可以 reddit_get_user_posts 看你自己的发帖。',
  'source.github.label':    'GitHub token',
  'source.github.hint':     '给 github_read 用。可选 — 不填 60 次/小时,填了 5000/小时。',
  'source.xHandle.label':   '自己的 X 账号',
  'source.xHandle.hint':    '填你的 X 账号 handle(不带 @)。所有需要看"你自己的 X 账号"数据的功能都从这里调用:看对标动态、我的数据、互动复盘、内容策略等。',
  'source.xAuth.label':     'X auth_token',
  'source.xAuth.hint':      '给 twitter_get_user_tweets / twitter_get_tweet_replies / twitter_get_tweet_metrics 用。从浏览器 devtools 拿。',
  'source.xCt0.label':      'X ct0',
  'source.xCt0.hint':       'X 的 csrf token。和 auth_token 配对使用。',
  'source.btn.add':         '添加',
  'source.btn.save':        '保存',
  'source.btn.replace':     '替换',
  'source.btn.forget':      '清空',
  'source.confirmForget':   '确定要清空这个 token 吗?',
  'source.status.set':      '已设置',
  'source.status.unset':    '未设置',
  'source.statusMsg.loading':'加载中…',
  'source.empty':           '还没有数据源。点上面加一个。',
} as const;

export type DictKey = keyof typeof dict;

/**
 * 取中文文案。missing key 用 `!key!` 标记方便定位。
 */
export function t(
  key: DictKey,
  params?: Record<string, string | number>,
): string {
  const raw = dict[key];
  if (raw === undefined) return `!missing:${key}`;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

export const TOOL_TRACE_STORAGE_KEY = 'vp_show_tool_trace';
