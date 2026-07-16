/**
 * LLM:Path C — 从 quiz 答案 + 对比题 + 自由描述合成 voice DNA
 *
 * 关键:对比题直接用 B3 的 5 模板样例,选 2 次 → 推断主模板
 */

import { deepseek } from'./llm';
import { isValidFeatures, clampConfidence, type VoiceDnaFeatures } from'./voiceDna';
import { getVoiceTemplate, type VoiceTemplateId } from'./voiceTemplates';

export type QuizAnswers = {
 sentence_length:'short'|'medium'|'long';
 emoji_rate:'never'|'sometimes'|'often';
 question_rate:'low'|'medium'|'high';
 formality:'casual'|'balanced'|'formal';
 story_focus:'yes'|'no';
};

export type SynthInput = {
 quiz_answers: QuizAnswers;
 compare_choices: VoiceTemplateId[]; // 2 个模板 id
 freeform: string | null;
};

const DNA_SYNTHESIS_PROMPT = `你是写作风格合成器。基于用户的 quiz 答案 + 对比题选择 + 自由描述,合成一份完整的 voice DNA。

## 输入
- Quiz 答案
- 对比题选了哪 2 个模板(A=operator / B=provocateur / C=teacher / D=storyteller / E=curator)
- 自由描述(可选)

## 步骤
1. 找到主模板:2 题都选同一模板 → 主;不同 → 用第一个为主,第二个为辅
2. 用主模板的 features 作为基础
3. 用 quiz 答案**精确调整**数值:
 - sentence_length='short'→ mean 减 5
 - sentence_length='long'→ mean 加 5
 - emoji_rate='never'→ 0;'sometimes'→ 0.05;'often'→ 0.15
 - question_rate='low'→ 0.05;'medium'→ 0.20;'high'→ 0.35
 - formality='casual'→ casual 加 0.3,professional 减 0.2
 - formality='formal'→ professional 加 0.3,casual 减 0.2
 - story_focus='yes'→ story hooks 加 0.15
4. 用 freeform 补充 signature_patterns
5. 调整后必须自洽:所有比例字段总和≈1;emoji/question 等要在合理范围
6. 保留主模板的 sample_tweets 作为代表

## 输出 JSON 字段
同提取 prompt。返回格式:
{"sentence_length":{"mean":18,"p50":16,"p90":32},"structure":{...},"emoji_rate":0.05,"punctuation":{...},"vocabulary":{...},"tone":{...},"hooks":{...},"topics":["..."],"signature_patterns":["..."],"language":"en"}

只返回 JSON,不要解释。`;

/**
 * 调用 LLM 合成 DNA
 */
export async function synthesizeVoiceDnaFromQuiz(
 input: SynthInput,
): Promise<{ features: VoiceDnaFeatures; confidence: number; samples: string[] }> {
 const mainId = input.compare_choices[0];
 const secondaryId = input.compare_choices[1] ?? mainId;
 const main = getVoiceTemplate(mainId);
 const secondary = getVoiceTemplate(secondaryId);

 if (!main) {
 throw new Error(`Unknown template: ${mainId}`);
 }

 // Build prompt input
 const userMsg = `## Quiz 答案
${JSON.stringify(input.quiz_answers, null, 2)}

## 对比题选择
- 主模板: ${mainId} (${main.nameEn})
- 副模板: ${secondaryId} (secondary?.nameEn ??'same'})

## 自由描述
${input.freeform ||'(无)'}

## 主模板基础 features
${JSON.stringify(main.features, null, 2)}

## 副模板 features(供参考)
${secondary ? JSON.stringify(secondary.features, null, 2) :'(same as main)'}`;

 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 { role:'system', content: DNA_SYNTHESIS_PROMPT },
 { role:'user', content: userMsg },
 ],
 temperature: 0.3,
 max_tokens: 8000,
 });

 const raw = resp.choices[0]?.message?.content?.trim() ??'';
 const json = raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();

 let parsed: unknown;
 try {
 parsed = JSON.parse(json);
 } catch {
 console.error('[dnaSynthesis] JSON parse failed:', json.slice(0, 500));
 // Fallback: use main template features directly
 return {
 features: main.features,
 confidence: 0.6,
 samples: main.sampleTweets,
 };
 }

 if (!isValidFeatures(parsed)) {
 console.warn('[dnaSynthesis] Invalid features from LLM, using template fallback');
 return {
 features: main.features,
 confidence: 0.6,
 samples: main.sampleTweets,
 };
 }

 // Add freeform as signature pattern
 if (input.freeform && input.freeform.trim().length > 0) {
 parsed.signature_patterns = [
 `用户自述:"${input.freeform.trim()}"`,
 ...parsed.signature_patterns,
 ];
 }

 return {
 features: parsed,
 confidence: clampConfidence(0.7), // quiz 不如真推文
 samples: main.sampleTweets,
 };
}
