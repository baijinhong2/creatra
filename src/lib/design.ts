import {
 Dna, Sparkles, Target, ClipboardList, Wand2, RefreshCw,
 Lightbulb, Copy, LineChart, Calendar, CheckCircle2, Check,
 TrendingUp, TrendingDown, Minus, Paperclip, Send,
 X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
 ArrowLeft, ArrowRight, ArrowUp, LogOut, Settings,
 Plus, Trash2, Inbox, Flame, BarChart3, Star, Brain, Database,
 Sun, Moon, AlertTriangle, Hammer, Bot, Palette,
 Book, Briefcase, Smile, Code, Save, FileText, Image,
 Monitor, Server, MessageCircle, Share2, PartyPopper,
 type LucideIcon,
} from'lucide-react';

// ── 字号(6 档,只能选这些)─────────────────
export const FONT_SIZE = {
 caption:'text-xs', // 12px
 small:'text-sm', // 14px
 body:'text-base', // 16px
 emphasis:'text-lg', // 18px
 title:'text-xl', // 20px
 hero:'text-2xl', // 24px
} as const;
export type FontSize = keyof typeof FONT_SIZE;

// ── 语义色(只准用 token)────────────
// 主色 = 亮金箔 amber-400 (#FBBF24) — 偏黄、像金箔/香槟金,华丽但不刺眼
// hover = amber-500 (#F59E0B) — 稍深一档,保持层次
// 文字 = zinc-900(黑) — 不能改金,否则对比度爆
export const COLOR = {
  bg:      'bg-zinc-50',
  surface: 'bg-white',
  border:  'border-zinc-200',
  text:    'text-zinc-900',
  muted:   'text-zinc-500',
  subtle:  'text-zinc-400',
  primary: 'bg-amber-400 text-zinc-900 hover:bg-amber-500',
  danger:  'bg-red-50 text-red-700',
  success: 'bg-emerald-50 text-emerald-700',
  warn:    'bg-amber-50 text-amber-900',
} as const;
export type ColorToken = keyof typeof COLOR;

// ── Icon 命名(产品用到的统一)─────────────
export const ICON = {
 dna: Dna,
 sparkle: Sparkles,
 target: Target,
 clipboard: ClipboardList,
 wand: Wand2,
 refresh: RefreshCw,
 bulb: Lightbulb,
 copy: Copy,
 chart: LineChart,
 calendar: Calendar,
 check: CheckCircle2,
 checkPlain: Check,
 trendUp: TrendingUp,
 trendDown: TrendingDown,
 trendFlat: Minus,
 paperclip: Paperclip,
 send: Send,
 close: X,
 chevDown: ChevronDown,
 chevUp: ChevronUp,
 chevLeft: ChevronLeft,
 chevRight: ChevronRight,
 arrowLeft: ArrowLeft,
 arrowRight: ArrowRight,
 arrowUp: ArrowUp,
 logout: LogOut,
 settings: Settings,
 plus: Plus,
 trash: Trash2,
 // 新增:theme / warning / categories / cross-post / nav
 sun: Sun,
 moon: Moon,
 warn: AlertTriangle,
 hammer: Hammer,
 bot: Bot,
 palette: Palette,
 book: Book,
 briefcase: Briefcase,
 smile: Smile,
 code: Code,
 save: Save,
 fileText: FileText,
 image: Image,
 monitor: Monitor,
 server: Server,
 messageCircle: MessageCircle,
 share: Share2,
 party: PartyPopper,
 // sidebar
 inbox: Inbox,
 flame: Flame,
 barChart: BarChart3,
 star: Star,
 brain: Brain,
 database: Database,
} as const;
export type IconName = keyof typeof ICON;

// ── 间距(6 阶梯)────────────
export const SPACE = {
 xs:'gap-1', // 4px
 sm:'gap-2', // 8px
 md:'gap-3', // 12px
 lg:'gap-4', // 16px
 xl:'gap-6', // 24px'2xl':'gap-8', // 32px
} as const;

// ── 圆角(3 档 + full)───────────
// 严格只用这 3 档。`rounded-lg` / `rounded-2xl` 全仓禁用。
export const RADIUS = {
 // T1: 8px — buttons / inputs / chips / tags / pills / small badges
 sm:'rounded-lg',
 // T2: 12px — cards / modals / popovers / onboarding cards / message bubbles
 md:'rounded-xl',
 // T3: 16px — 顶层对话框 (login modal / cross-post modal 等)
 lg:'rounded-2xl',
 // 圆形 — avatar / dot / progress fill
 full:'rounded-full',
} as const;

// ── 锌色档位白名单 ────────────
// 固化"允许的" zinc 档位,避免散乱使用。
export const ZINC = {
  page:       'bg-zinc-50',       // 页面底色
  surface:    'bg-white',         // 卡片/弹层
  surfaceAlt: 'bg-zinc-100',      // 备选/hover
  border:     'border-zinc-200',  // 边框
  text:       'text-zinc-900',    // 主文字
  muted:      'text-zinc-500',    // 次要文字
  subtle:     'text-zinc-400',    // 极弱文字
} as const;

export type { LucideIcon };
