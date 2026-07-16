import OpenAI from 'openai';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
const apiKey = env.split('\n').find(l => l.startsWith('DEEPSEEK_API_KEY='))?.split('=')[1]?.trim();
const deepseek = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

const SHORT = `分析以下推文,提取 voice DNA JSON。

每条推文独立分析,然后综合成完整 DNA:
- sentence_length: {mean, p50, p90}
- structure: {single_sentence, multi_sentence, list, question, dialogue} 比例
- emoji_rate: 0-1
- punctuation: {exclamation, question, ellipsis, linebreak}
- vocabulary: {top_words: 10个, domain_terms: 5个, avoids: 3个}
- tone: {casual, professional, humorous, serious, warm} 比例和≈1
- hooks: {data_first, contrarian, question, story, list} 比例
- topics: 5个
- signature_patterns: 3-5个
- language: 'zh' | 'en' | 'mixed'

只返回 JSON,不要解释。`;

const tweets = `T1: Day 21 of building Koi.
T2: MRR: $2.1k → $3.4k. Churn dropped from 8% → 3%.
T3: Changed pricing from $9 → $19.
T4: 今天把 onboarding 从 5 步缩到 3 步,激活率从 22% → 31%。
T5: 代码只有 240 行,大部分是 SQL 索引。
T6: 我之前一直觉得定价是难题。其实问题不在定价。
T7: Day 47 of building Koi. Shipped search today.
T8: Before: 用户 scroll 3+ 页。After: 平均 1.2 次 query/session。
T9: 240 行代码,6 小时,大部分 SQL 索引。
T10: Lessons: 别小看 infra 工作。`;

console.log('=== Short prompt, v4-pro, 4000 ===');
let r = await deepseek.chat.completions.create({
  model: 'deepseek-v4-pro',
  messages: [
    { role: 'system', content: SHORT },
    { role: 'user', content: '推文:\n' + tweets },
  ],
  temperature: 0.2,
  max_tokens: 8000,
});
console.log('Length:', r.choices[0]?.message?.content?.length);
console.log('Reasoning:', r.usage?.completion_tokens_details?.reasoning_tokens);
console.log('Finish:', r.choices[0]?.finish_reason);
console.log('First 200:', r.choices[0]?.message?.content?.slice(0, 200));
