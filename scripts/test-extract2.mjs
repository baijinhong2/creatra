import OpenAI from 'openai';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
const apiKey = env.split('\n').find(l => l.startsWith('DEEPSEEK_API_KEY='))?.split('=')[1]?.trim();

const deepseek = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

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
3. **数据驱动**:每个特征后面用推文原文举例
4. **不夸大置信度**:样本 < 10 条标 confidence 0.5
5. **只返回 JSON,不要 markdown 代码块,不要任何解释文字**

## 输出 JSON 字段
- sentence_length: { mean, p50, p90 }
- structure: { single_sentence, multi_sentence, list, question, dialogue }
- emoji_rate: 0-1
- punctuation: { exclamation, question, ellipsis, linebreak }
- vocabulary: { top_words: 10个, domain_terms: 5个, avoids: 3个 }
- tone: { casual, professional, humorous, serious, warm }
- hooks: { data_first, contrarian, question, story, list }
- topics: 5 个
- signature_patterns: 3-5 个
- language: 'zh' | 'en' | 'mixed'

只返回 JSON,不要任何解释。`;

const userMsg = `推文(共 ${chunks.length} 条):\n${chunks.map((t, i) => `T${i + 1}: ${t}`).join('\n')}`;

// Try v4-flash with 4000 max_tokens
console.log('=== v4-flash 4000 ===');
let r = await deepseek.chat.completions.create({
  model: 'deepseek-v4-flash',
  messages: [
    { role: 'system', content: DNA_EXTRACTION_PROMPT },
    { role: 'user', content: userMsg },
  ],
  temperature: 0.2,
  max_tokens: 4000,
});
console.log('Length:', r.choices[0]?.message?.content?.length);
console.log('Reasoning:', r.usage?.completion_tokens_details?.reasoning_tokens);
console.log('First 200:', r.choices[0]?.message?.content?.slice(0, 200));
