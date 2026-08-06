import { SEARCH_RELEVANCE_CASES } from "./cases.js";
import type { EmotionTag } from "../sync/types.js";

const tagByCase: Record<string, EmotionTag[]> = {
  cry: ["泣ける", "切ない"],
  laugh: ["笑える", "爽快"],
  comfort: ["癒やし", "心温まる"],
  safe: ["心温まる", "希望"],
};

export const CURATED_SEARCH_EMOTIONS: Record<
  number,
  Partial<Record<EmotionTag, number>>
> = {};

for (const evaluationCase of SEARCH_RELEVANCE_CASES) {
  for (const judgment of evaluationCase.judgments) {
    if (judgment.label !== "relevant") continue;
    const scores = (CURATED_SEARCH_EMOTIONS[judgment.tmdbId] ??= {});
    for (const tag of tagByCase[evaluationCase.id] ?? []) {
      scores[tag] = Math.max(scores[tag] ?? 0, 0.92);
    }
  }
}
