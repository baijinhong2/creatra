/**
 * Reply Drafter LLM
 */

import { deepseek } from'./llm';
import { loadUserDna, dnaToPromptSection } from'./voiceDnaStore';
import type { VoiceDnaFeatures } from'./voiceDna';
import type { Reply } from'./replies';

export type DraftOption = {
 text: string;
 strategy: string;
 why_this: string;
};

export type DraftResult = {
 drafts: DraftOption[];
 parent_tweet_summary: string;
};

const REPLY_DRAFTER_PROMPT = `你是 X 回复草稿专家。基于用户 voice DNA + parent tweet + 对方 reply,起草 ${3} 个差异化回复选项。

## 真实性自审
1. **不编造事实** — 不能编对方没说过的话,不能假设对方的立场
2. **不套通用话** — 不能像"作为一个 AI"/"great point"/"interesting perspective"3. **不卑不亢** — 不要"sorry if..."过度道歉,也不要"Thank you for your feedback"客套
4. **3 个 draft 必须 strategy 完全不同** — 不能同一句换 3 个词

## 输入
### Parent tweet(用户发的)
{TWEET_TEXT}

### Reply(对方回复用户的)
作者: @{AUTHOR_HANDLE}
内容: {REPLY_TEXT}

### 用户 voice DNA
{DNA_TEXT}

### 用户代表推文
{SAMPLES}

## 输出
{drafts: [{text, strategy, why_this}], parent_tweet_summary}
- text 长度 < 280 字符
- 1-2 句为主,3 句为辅
- strategy 标签真实描述:agree_with_addition / polite_pushback / ask_clarifying_question / add_data / share_experience / humor / 等
- why_this 1 句话解释为什么这样写

只返回 JSON,不要解释。`;

export async function draftReplies(
 userId: string,
 parentTweetText: string,
 replyText: string,
 replyAuthorHandle: string,
 count: number = 3,
 toneOverride?:'agree'|'disagree'|'add_info'|'humor',
): Promise<DraftResult> {
 const dna = await loadUserDna(userId);
 const dnaText = dna ? dnaToPromptSection(dna) :'(no DNA set yet)';
 const samples = dna?.sample_tweets?.slice(0, 3).join('\n') ??'';

 const userMsg = `### Parent tweet
${parentTweetText}

### Reply
作者: @${replyAuthorHandle}
内容: ${replyText}

### User voice DNA
${dnaText}

### 代表推文
${samples}

### Tone override
${toneOverride ??'(不指定,按 DNA 走)'}

### Count
${count}`;

 const prompt = REPLY_DRAFTER_PROMPT
 .replace(/\{TWEET_TEXT\}/g, parentTweetText)
 .replace(/\{AUTHOR_HANDLE\}/g, replyAuthorHandle)
 .replace(/\{REPLY_TEXT\}/g, replyText)
 .replace(/\{DNA_TEXT\}/g, dnaText)
 .replace(/\{SAMPLES\}/g, samples)
 .replace(/\{3\}/g, String(count));

 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: prompt },
 { role:'user', content: userMsg },
 ],
 temperature: 0.7,
 max_tokens: 8000,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();

 try {
 const parsed = JSON.parse(json);
 return {
 drafts: Array.isArray(parsed.drafts) ? parsed.drafts.slice(0, count) : [],
 parent_tweet_summary: parsed.parent_tweet_summary ??'',
 };
 } catch {
 console.error('[replyDrafter] JSON parse failed:', json.slice(0, 500));
 return { drafts: [], parent_tweet_summary:''};
 }
}
