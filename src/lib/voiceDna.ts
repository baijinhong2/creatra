/**
 * Voice DNA 数据结构定义 + 类型守卫 + 工具函数
 */

import type { VoiceDnaFeatures } from'./voiceDna.types';
export type { VoiceDnaFeatures } from'./voiceDna.types';

export type VoiceDnaSource =
 |'own_tweets'|'reference_handles'|'preset_template'|'quiz'|'freeform';

export type VoiceDna = {
 user_id: string;
 source_type: VoiceDnaSource;
 source_meta: Record<string, unknown> | null;
 source_tweet_count: number;
 features: VoiceDnaFeatures;
 confidence: number;
 sample_tweets: string[] | null;
 version: number;
 last_extracted_at: string;
 outdated_at: string | null;
 created_at: string;
 updated_at: string;
};

/** 校验 LLM 返回的 features JSON 是否合理 */
export function isValidFeatures(x: unknown): x is VoiceDnaFeatures {
 if (!x || typeof x !=='object') return false;
 const f = x as Record<string, unknown>;
 if (!f.sentence_length || typeof f.sentence_length !=='object') return false;
 if (!f.structure || typeof f.structure !=='object') return false;
 if (typeof f.emoji_rate !=='number') return false;
 if (!f.vocabulary || typeof f.vocabulary !=='object') return false;
 if (!f.tone || typeof f.tone !=='object') return false;
 if (!f.hooks || typeof f.hooks !=='object') return false;
 if (!Array.isArray(f.topics)) return false;
 if (!Array.isArray(f.signature_patterns)) return false;
 if (!f.language) return false;
 return true;
}

/** 格式化 features 为 prompt 注入文本 */
export function featuresToPromptText(features: VoiceDnaFeatures): string {
 const tld = (arr: string[], n = 5) => arr.slice(0, n).join(',');
 return [
 `**句长**: 平均 ${features.sentence_length.mean} 字,p50 ${features.sentence_length.p50},p90 ${features.sentence_length.p90}`,
 `**句式**: 单句 ${(features.structure.single_sentence * 100).toFixed(0)}%,多句 ${(features.structure.multi_sentence * 100).toFixed(0)}%,列表 ${(features.structure.list * 100).toFixed(0)}%,问句 ${(features.structure.question * 100).toFixed(0)}%`,
 `**emoji 频率**: ${(features.emoji_rate * 100).toFixed(0)}%`,
 `**语气**: ${Object.entries(features.tone).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join('/')}`,
 `**钩子偏好**: ${Object.entries(features.hooks).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join('/')}`,
 `**主题**: ${tld(features.topics)}`,
 `**代表词**: ${tld(features.vocabulary.top_words, 5)}`,
 `**行业词**: ${tld(features.vocabulary.domain_terms)}`,
 `**避免**: ${tld(features.vocabulary.avoids)}`,
 `**标志特征**:`,
 ...features.signature_patterns.map((p) => ` - ${p}`),
 ].join('\n');
}

/** 格式化 sample tweets 注入 prompt */
export function sampleTweetsToPromptText(samples: string[] | null | undefined): string {
 if (!samples || samples.length === 0) return'';
 return samples
 .map((t, i) => `${i + 1}. ${t.length > 200 ? t.slice(0, 200) +'...': t}`)
 .join('\n');
}

/** 校验 confidence 范围 */
export function clampConfidence(n: number): number {
 if (Number.isNaN(n)) return 0.5;
 if (n < 0) return 0;
 if (n > 1) return 1;
 return n;
}
