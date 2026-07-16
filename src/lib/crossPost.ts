/**
 * Cross-Platform Rewrite:把 X 推改写为即刻/小红书/LinkedIn
 */

import { deepseek } from'./llm';
import { loadUserDna, dnaToPromptSection } from'./voiceDnaStore';

export type Platform ='jike'|'xiaohongshu'|'linkedin';

const PLATFORM_PROMPTS: Record<Platform, string> = {
 jike: `把 X 推文改写为即刻版本。

## 即刻风格
- 短句为主,平均 30-50 字
- 圈子黑话/网络流行语可加(用户 DNA 允许时)
- 末尾不加 hashtag(即刻靠兴趣标签自动分发)
- 可加"?"结尾引发讨论
-"我"第一人称比例高
- char_limit: 1000

## 输出
{
 text: string, // < 1000 字
 style_notes: string,
 char_count: int,
 hashtags: null, // 即刻不要
 source_attribution: string | null
}

只返回 JSON。`,

 xiaohongshu: `把 X 推文改写为小红书版本。

## 小红书风格
- 种草体,emoji 多(但按 DNA 调,DNA emoji_rate=0 时少用)
- 标题党但要有干货
- 末尾加 3-5 个 hashtag
- 段落化(用空行分)
- char_limit: 1000

## 输出
{
 text: string, // 段落化,emoji,标题
 style_notes: string,
 char_count: int,
 hashtags: [string, string, string, string, string], // 3-5 个
 source_attribution: string | null
}

只返回 JSON。`,

 linkedin: `把 X 推文改写为 LinkedIn 版本。

## LinkedIn 风格
- Professional 但不冷(可故事化)
- 可长(3000 char),用 hook → 故事 → 教训 3 段
- 不用太多 emoji(DNA 允许可加)
- 用 linebreak 分段
- 用"I"不用"we"(个人账号)
- char_limit: 3000

## 输出
{
 text: string, // 3 段式
 style_notes: string,
 char_count: int,
 hashtags: null, // LinkedIn 不要 hashtag
 source_attribution: string | null
}

只返回 JSON。`,
};

export async function rewriteForPlatform(
 userId: string,
 sourceTweet: string,
 sourceUrl: string | null,
 platform: Platform,
): Promise<{
 platform: Platform;
 text: string;
 style_notes: string;
 char_count: number;
 hashtags: string[] | null;
 source_attribution: string | null;
}> {
 const dna = await loadUserDna(userId);
 const dnaText = dna ? dnaToPromptSection(dna) :'(no DNA)';
 const samples = dna?.sample_tweets?.slice(0, 2).join('\n') ??'';

 const userMsg = `### 原 X 推
${sourceTweet}

${sourceUrl ? `### 原文 URL(末尾引用)\n${sourceUrl}` :''}

### 用户 voice DNA
${dnaText}

### 用户样例
${samples}`;

 const systemPrompt = PLATFORM_PROMPTS[platform];

 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: systemPrompt },
 { role:'user', content: userMsg },
 ],
 temperature: 0.6,
 max_tokens: 8000,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();

 try {
 const parsed = JSON.parse(json);
 return {
 platform,
 text: String(parsed.text ??''),
 style_notes: String(parsed.style_notes ??''),
 char_count: (parsed.text ??'').length,
 hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : null,
 source_attribution: parsed.source_attribution ?? (sourceUrl ? `via ${sourceUrl}` : null),
 };
 } catch {
 return {
 platform,
 text: sourceTweet,
 style_notes:'(改写失败,使用原文)',
 char_count: sourceTweet.length,
 hashtags: null,
 source_attribution: sourceUrl ? `via ${sourceUrl}` : null,
 };
 }
}

export function getPlatformMeta(platform: Platform): { id: Platform; name: string; emoji: string; charLimit: number; style: string } {
 const map: Record<Platform, { id: Platform; name: string; emoji: string; charLimit: number; style: string }> = {
 jike: { id:'jike', name:'即刻', emoji:'📱', charLimit: 1000, style:'短句、圈子黑话、加 ?'},
 xiaohongshu: { id:'xiaohongshu', name:'小红书', emoji:'📕', charLimit: 1000, style:'种草体、emoji、加 3-5 tags'},
 linkedin: { id:'linkedin', name:'LinkedIn', emoji:'💼', charLimit: 3000, style:'Professional、3 段式'},
 };
 return map[platform];
}
