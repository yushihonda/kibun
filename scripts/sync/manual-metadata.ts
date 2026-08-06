import type { EmotionTag } from "./types.js";

export type ManualMovieMetadata = {
  aliases?: string[];
  emotionScores?: Partial<Record<EmotionTag, number>>;
};

// Curated entries are intentionally small and auditable. They override rules,
// while the deterministic classifier covers the rest of the catalog.
export const MANUAL_MOVIE_METADATA: Record<number, ManualMovieMetadata> = {
  129: {
    aliases: ["千と千尋", "せんとちひろのかみかくし", "Spirited Away"],
    emotionScores: { 心温まる: 0.82, 希望: 0.78, ノスタルジック: 0.74 },
  },
  10193: {
    aliases: ["トイストーリー3", "といすとーりーすりー", "Toy Story 3"],
    emotionScores: { 泣ける: 0.9, 心温まる: 0.9, ノスタルジック: 0.82 },
  },
  76341: {
    aliases: ["マッドマックス 怒りのデスロード", "Mad Max Fury Road"],
    emotionScores: { 爽快: 0.96, 緊張感: 0.9, 高揚感: 0.92 },
  },
  346648: {
    aliases: ["パディントン2", "ぱでぃんとんつー", "Paddington 2"],
    emotionScores: { 心温まる: 0.96, 笑える: 0.82, 癒やし: 0.88 },
  },
  354912: {
    aliases: ["リメンバーミー", "りめんばーみー", "Coco"],
    emotionScores: { 泣ける: 0.96, 心温まる: 0.92, ノスタルジック: 0.85 },
  },
  361743: {
    aliases: ["トップガン マーヴェリック", "Top Gun Maverick"],
    emotionScores: { 爽快: 0.96, 高揚感: 0.95, ノスタルジック: 0.72 },
  },
  496243: {
    aliases: ["パラサイト 半地下の家族", "Parasite", "기생충"],
    emotionScores: { 緊張感: 0.92, 不穏: 0.9, 考えさせられる: 0.88 },
  },
  666277: {
    aliases: ["パストライブス", "Past Lives"],
    emotionScores: { 切ない: 0.96, 泣ける: 0.8, ノスタルジック: 0.88 },
  },
  693134: {
    aliases: ["デューン2", "Dune Part Two"],
    emotionScores: { 高揚感: 0.94, 緊張感: 0.86, 考えさせられる: 0.68 },
  },
  976893: {
    aliases: ["パーフェクトデイズ", "Perfect Days"],
    emotionScores: { 癒やし: 0.94, 心温まる: 0.82, 考えさせられる: 0.76 },
  },
};
