/**
 * Voice DNA features TypeScript 类型定义
 */

export type SentenceLength = { mean: number; p50: number; p90: number };

export type Structure = {
 single_sentence: number;
 multi_sentence: number;
 list: number;
 question: number;
 dialogue: number;
};

export type Punctuation = {
 exclamation: number;
 question: number;
 ellipsis: number;
 linebreak: number;
};

export type Vocabulary = {
 top_words: string[];
 domain_terms: string[];
 avoids: string[];
};

export type Tone = {
 casual: number;
 professional: number;
 humorous: number;
 serious: number;
 warm: number;
};

export type Hooks = {
 data_first: number;
 contrarian: number;
 question: number;
 story: number;
 list: number;
};

export type VoiceDnaFeatures = {
 sentence_length: SentenceLength;
 structure: Structure;
 emoji_rate: number;
 punctuation: Punctuation;
 vocabulary: Vocabulary;
 tone: Tone;
 hooks: Hooks;
 topics: string[];
 signature_patterns: string[];
 language:'zh'|'en'|'mixed';
};
