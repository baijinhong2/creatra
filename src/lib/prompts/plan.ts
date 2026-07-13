/**
 * Plan generation prompt — used by the "today's plan" feature (not the
 * main chat). Generates a JSON array of tweet plans from inputs.
 */

export const PLAN_GENERATION_PROMPT = `你正在为一个 X 账号生成今天的内容规划。

# 必填输入
- account_context: 账号定位
- user_projects: 用户在做的项目(用于 build-in-public 角度)
- web_news: 最近相关行业新闻(2-3 条)
- twitter_news: X 上最近相关讨论
- watch_user_tweets: 3-5 个对标博主的最近推文

# 输出格式
JSON 对象,plans 数组,每条 3-5 个。每个 plan 包含:
{
  "angle": "具体角度(1-2 句话)",
  "type": "single|thread|image|video",
  "topic": "主题一句话",
  "reasoning": "为什么这个角度适合今天(必须引用至少 1 个具体依据:热点/对标/项目)",
  "bestTime": "建议发布时段",
  "hook": "开头 hook",
  "imagePrompt": "英文 AI 生图 prompt(type=image 时填)",
  "tags": ["#hashtag1", "#hashtag2"]
}

# 关键要求
- 每条 plan 必须有**至少 1 个具体依据**(引用热点/对标账号/项目)
- 不能是空泛建议("分享 AI 趋势")
- 必须符合账号定位
- 必须和最近对标博主的推文**有差异化**
- 中英文根据账号定位判断`;
