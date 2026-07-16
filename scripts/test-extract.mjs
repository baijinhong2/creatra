import OpenAI from 'openai';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
const apiKey = env.split('\n').find(l => l.startsWith('DEEPSEEK_API_KEY='))?.split('=')[1]?.trim();
console.log('API key present:', !!apiKey, apiKey?.slice(0, 10));

const deepseek = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

// Test the actual prompt
const chunks = [
  "Day 21 of building Koi.",
  "MRR: $2.1k → $3.4k. Churn dropped.",
  "今天把 onboarding 从 5 步缩到 3 步",
  "激活率从 22% → 31%。",
  "Day 47. Shipped search.",
  "平均 1.2 次 query/session。",
  "Lessons: 别小看 infra 工作。"
];

const DNA_EXTRACTION_PROMPT = `你是一个写作风格分析师。基于用户的 X 推文,提取结构化的"声音 DNA"。

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

## 推文(共 N 条)
T1: ...
T2: ...
...

返回格式示例:
{"sentence_length":{"mean":18,"p50":16,"p90":32},"structure":{"single_sentence":0.4,"multi_sentence":0.35,"list":0.1,"question":0.15,"dialogue":0},"emoji_rate":0.05,"punctuation":{"exclamation":0.02,"question":0.3,"ellipsis":0.1,"linebreak":0.4},"vocabulary":{"top_words":["...","..."],"domain_terms":["..."],"avoids":["..."]},"tone":{"casual":0.6,"professional":0.2,"humorous":0.1,"serious":0.05,"warm":0.05},"hooks":{"data_first":0.1,"contrarian":0.2,"question":0.3,"story":0.1,"list":0.3},"topics":["...","..."],"signature_patterns":["...","..."],"language":"en"}`;

const tweetList = chunks
  .map((t, i) => `T${i + 1}: ${t}`)
  .join('\n');

const userMsg = `推文(共 ${chunks.length} 条):\n${tweetList}`;

const resp = await deepseek.chat.completions.create({
  model: 'deepseek-v4-flash',
  messages: [
    { role: 'system', content: DNA_EXTRACTION_PROMPT },
    { role: 'user', content: userMsg },
  ],
  temperature: 0.2,
  max_tokens: 2000,
});

console.log('Content:', JSON.stringify(resp.choices[0]?.message?.content));
console.log('Length:', resp.choices[0]?.message?.content?.length);
console.log('Finish reason:', resp.choices[0]?.finish_reason);
console.log('Usage:', JSON.stringify(resp.usage));
