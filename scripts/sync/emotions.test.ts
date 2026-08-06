import { describe, expect, it } from "vitest";
import { buildEmotionProfile, deriveRuleEmotionScores } from "./emotions.js";
import type { TmdbDetails } from "./types.js";

function movie(overrides: Partial<TmdbDetails> = {}): TmdbDetails {
  return {
    id: 999_999_999,
    title: "テスト映画",
    original_title: "Test Movie",
    overview: "家族との別れと再会を描く、涙と希望の物語。",
    release_date: "2026-01-01",
    poster_path: null,
    backdrop_path: null,
    popularity: 10,
    vote_average: 8,
    vote_count: 100,
    adult: false,
    original_language: "ja",
    origin_country: ["JP"],
    genres: [{ id: 18, name: "ドラマ" }],
    runtime: 120,
    status: "Released",
    tagline: "もう一度、会いたい",
    homepage: "",
    imdb_id: null,
    keywords: { keywords: [{ id: 1, name: "家族" }] },
    reviews: { results: [{ id: "review", content: "心温まる作品" }] },
    ...overrides,
  };
}

describe("emotion enrichment", () => {
  it("uses synopsis, reviews, keywords and genres to calculate intensity", () => {
    const scores = deriveRuleEmotionScores(movie());

    expect(scores["泣ける"]).toBeGreaterThanOrEqual(0.8);
    expect(scores["心温まる"]).toBeGreaterThanOrEqual(0.7);
    expect(scores["希望"]).toBeGreaterThanOrEqual(0.4);
  });

  it("combines rules, human overrides and capped AI labels deterministically", () => {
    const profile = buildEmotionProfile(movie(), {
      existingScores: { 泣ける: 0.5 },
      databaseOverrides: { 泣ける: 1, 考えさせられる: 0.85 },
      aiTags: ["切ない", "泣ける"],
    });

    expect(profile.source).toBe("rules+human_override+ai_capped");
    expect(profile.scores["泣ける"]).toBe(1);
    expect(profile.scores["切ない"]).toBeGreaterThanOrEqual(0.76);
    expect(profile.tags).toContain("考えさせられる");
    expect(profile.tags).toHaveLength(5);
  });
});
