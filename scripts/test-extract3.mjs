import OpenAI from 'openai';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
const apiKey = env.split('\n').find(l => l.startsWith('DEEPSEEK_API_KEY='))?.split('=')[1]?.trim();

const deepseek = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

const chunks = [
  "Day 21 of building Koi.",
  "MRR: $2.1k → $3.4k. Churn dropped from 8% → 3%.",
  "Changed pricing from $9 → $19.",
  "今天把 onboarding 从 5 步缩到 3 步,激活率从 22% → 31%。",
  "代码只有 240 行,大部分是 SQL 索引。",
  "我之前一直觉得定价是难题。其实问题不在定价,在 onboarding — 用户不知道你做啥。",
  "Day 47 of building Koi. Shipped search today.",
  "Before: 用户 scroll 3+ 页。After: 平均 1.2 次 query/session。",
  "240 行代码,6 小时,大部分 SQL 索引。",
  "Lessons: 别小看 infra 工作。"
];

const PROMPT = `你是写作风格分析师。基于用户的 X 推文,提取结构化的"声音 DNA"。

## 真实性自审(必须遵守)
1. **不编造数据**:统计不到就老实说 "样本不足",不要凑数字
2. **不套通用话**:"casual" "professional" 没用 — 要给具体特征(如"从不堆术语,平均句长 18 字")
3. **数据驱动**:每个特征后面用推文原文举例(引用 tweet 编号 T1/T2/T3)
4. **不夸大置信度**:样本 < 10 条标 confidence 0.5,≥ 30 条才标 0.9+
5. **只返回 JSON,不要 markdown 代码块,不要任何解释文字**

## 输出 JSON 字段(严格按此 schema)
- sentence_length: { mean, p50, p90 } 字符数
- structure: { single_sentence, multi_sentence, list, question, dialogue } 比例(0-1)
- emoji_rate: 0-1
- punctuation: { exclamation, question, ellipsis, linebreak } 比例
- vocabulary: { top_words: 10个, domain_terms: 5个行业词, avoids: 3个明显不用的 }
- tone: { casual, professional, humorous, serious, warm } 比例(总和≈1)
- hooks: { data_first, contrarian, question, story, list } 开头方式比例
- topics: 5 个主题
- signature_patterns: 3-5 个最标志特征
- language: 'zh' | 'en' | 'mixed'

## 推文(共 10 条)
T1: Day 21 of building Koi.
T2: MRR: $2.1k → $3.4k. Churn dropped from 8% → 3%.
T3: Changed pricing from $9 → $19.
T4: 今天把 onboarding 从 5 步缩到 3 步,激活率从 22% → 31%。
T5: 代码只有 240 行,大部分是 SQL 索引。
T6: 我之前一直觉得定价是难题。其实问题不在定价,在 onboarding — 用户不知道你做啥。
T7: Day 47 of building Koi. Shipped search today.
T8: Before: 用户 scroll 3+ 页。After: 平均 1.2 次 query/session。
T9: 240 行代码,6 小时,大部分 SQL 索引。
T10: Lessons: 别小看 infra 工作。

只返回 JSON。`;

console.log('=== v4-pro 4000 ===');
let r = await deepseek.chat.completions.create({
  model: 'deepseek-v4-pro',
  messages: [
    { role: 'system', content: PROMPT },
    { role: 'user', content: '请基于这些推文提取 voice DNA' },
  ],
  temperature: 0.2,
  max_tokens: 4000,
});
console.log('Length:', r.choices[0]?.message?.content?.length);
console.log('Reasoning:', r.usage?.completion_tokens_details?.reasoning_tokens);
console.log('Finish:', r.choices[0]?.finish_reason);
console.log('First 300:', r.choices[0]?.message?.content?.slice(0, 300));
