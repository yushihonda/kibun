import { describe, expect, it } from "vitest";
import type { Movie } from "@/types/movie";
import {
  buildPreferenceProfile,
  recommendMovies,
  type RecommendationInteraction,
} from "./engine";

function movie(id: string, genre: string, emotion: string): Movie {
  return {
    id,
    title: id,
    overview: "",
    posterUrl: "/placeholder-movie.svg",
    backdropUrl: "/placeholder-movie.svg",
    releaseDate: "2025-01-01",
    runtime: 100,
    voteAverage: 7.5,
    popularity: 50,
    genres: [genre],
    emotionalTags: [emotion],
    emotionScores: { [emotion]: 0.9 },
    providers: [],
  };
}

describe("recommendMovies", () => {
  it("uses three favorites and excludes watched titles with a reason", () => {
    const favorites = [
      movie("f1", "ドラマ", "泣ける"),
      movie("f2", "ドラマ", "泣ける"),
      movie("f3", "ロマンス", "切ない"),
    ];
    const interactions: RecommendationInteraction[] = favorites.map(
      (entry, index) => ({
        movie: entry,
        status: index === 0 ? "WATCHED" : "NONE",
        isFavorite: true,
        rating: 5,
      }),
    );
    const profile = buildPreferenceProfile(interactions, {
      enabled: true,
      genres: [],
      emotions: [],
    });
    const recommendations = recommendMovies(
      [
        ...favorites,
        movie("match", "ドラマ", "泣ける"),
        movie("other", "ホラー", "怖い"),
      ],
      profile,
      { limit: 2 },
    );

    expect(recommendations[0].id).toBe("match");
    expect(recommendations[0].recommendationReason).toBeTruthy();
    expect(recommendations.map((entry) => entry.id)).not.toContain("f1");
  });

  it("diversifies primary genres", () => {
    const profile = buildPreferenceProfile([], {
      enabled: true,
      genres: ["ドラマ", "コメディ"],
      emotions: [],
    });
    const candidates = Array.from({ length: 8 }, (_, index) =>
      movie(
        String(index),
        index < 6 ? "ドラマ" : "コメディ",
        index < 6 ? "泣ける" : "笑える",
      ),
    );
    const recommendations = recommendMovies(candidates, profile, { limit: 6 });
    expect(
      recommendations.filter((entry) => entry.genres[0] === "ドラマ"),
    ).toHaveLength(3);
    expect(
      recommendations.some((entry) => entry.genres[0] === "コメディ"),
    ).toBe(true);
  });

  it("uses low-weight detail views without treating them as watched", () => {
    const viewed = movie("viewed", "サイエンスフィクション", "高揚感");
    const profile = buildPreferenceProfile(
      [
        {
          movie: viewed,
          status: "NONE",
          isFavorite: false,
          rating: null,
          weight: 0.7,
          exclude: false,
        },
      ],
      { enabled: true, genres: [], emotions: [] },
    );

    expect(profile.genres.get("サイエンスフィクション")).toBe(0.7);
    expect(profile.excludedMovieIds.has("viewed")).toBe(false);
  });
});
