import OpenAI from 'openai';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf-8');
const apiKey = env.split('\n').find(l => l.startsWith('DEEPSEEK_API_KEY='))?.split('=')[1]?.trim();
if (!apiKey) {
  console.error('no key');
  process.exit(1);
}

const ds = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
const text = `Day 21 of building Koi. MRR: $2.1k → $3.4k. Churn dropped.

今天把 onboarding 从 5 步缩到 3 步,激活率从 22% → 31%。

Day 47. Shipped search. 平均 1.2 次 query/session。

Lessons: 别小看 infra 工作。`;

const prompt = `把以下用户内容拆分成 5-10 个独立片段(段落 / 推文 / 段落)。
每个片段至少 10 字符,完整,不重叠,反映不同写作场景。保留原文,只切不润色。
输入:
"""
${text}
"""
只返回 JSON: {"chunks": ["...", "..."]}`;

const r = await ds.chat.completions.create({
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.2,
  max_tokens: 3000,
});

console.log('Content:', JSON.stringify(r.choices[0]?.message?.content));
console.log('Length:', r.choices[0]?.message?.content?.length);
console.log('Finish:', r.choices[0]?.finish_reason);
console.log('Usage:', JSON.stringify(r.usage));
