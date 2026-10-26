import { describe, expect, it } from "vitest";
import type { Movie } from "@/types/movie";
import {
  blendWithInterest,
  buildPreferenceProfile,
  interestAffinity,
  interleaveForDiscovery,
  recommendMovies,
  type RecommendationInteraction,
} from "./engine";

function movie(id: string, genre: string, emotion: string): Movie {
  return {
    id,
    mediaType: "movie",
    title: id,
    overview: "",
    posterUrl: "/placeholder-movie.svg",
    backdropUrl: "/placeholder-movie.svg",
    releaseDate: "2025-01-01",
    runtime: 100,
    voteAverage: 7.5,
    voteCount: 1_000,
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

  it("uses fresh TikTok activity to change otherwise equal recommendations", () => {
    const profile = buildPreferenceProfile([], {
      enabled: true,
      genres: [],
      emotions: [],
    });
    const ordinary = movie("ordinary", "ドラマ", "余韻");
    const social = {
      ...movie("social", "ドラマ", "余韻"),
      socialSignals: {
        postCount: 10,
        totalViews: 1_000_000,
        totalLikes: 100_000,
        totalComments: 5_000,
        totalShares: 2_000,
        averageEngagementRate: 10.7,
        trendScore: 95,
        sentiment: "positive" as const,
        sentimentScore: 0.9,
        topHashtags: ["考察"],
        topics: ["ネタバレ考察"],
        latestPostAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        featuredPosts: [],
      },
    };

    expect(
      recommendMovies([ordinary, social], profile, { limit: 2 })[0].id,
    ).toBe("social");
  });
});

describe("home feed personalization helpers", () => {
  const profile = buildPreferenceProfile(
    [
      {
        movie: movie("fav", "アニメーション", "高揚感"),
        status: "WATCHED",
        isFavorite: true,
        rating: 5,
      },
    ],
    { enabled: true, genres: [], emotions: [] },
  );

  it("scores taste separately from popularity", () => {
    expect(
      interestAffinity(movie("a", "アニメーション", "高揚感"), profile).score,
    ).toBeGreaterThan(
      interestAffinity(movie("b", "ホラー", "不穏"), profile).score,
    );
  });

  it("lifts titles that match taste without discarding the section order", () => {
    const titles = [
      movie("trend-1", "ホラー", "不穏"),
      movie("trend-2", "アニメーション", "高揚感"),
      movie("trend-3", "ホラー", "不穏"),
      movie("trend-4", "ホラー", "不穏"),
    ];
    const order = new Map(titles.map((entry, index) => [entry.id, 10 - index]));
    const affinity = new Map(
      titles.map((entry) => [entry.id, interestAffinity(entry, profile).score]),
    );
    const ranked = blendWithInterest(
      titles,
      (entry) => order.get(entry.id)!,
      affinity,
    ).map((entry) => entry.id);
    expect(ranked[0]).toBe("trend-2");
    expect(ranked.slice(1)).toEqual(["trend-1", "trend-3", "trend-4"]);
    // Without taste signals the section keeps its own order.
    expect(
      blendWithInterest(titles, (entry) => order.get(entry.id)!, new Map()).map(
        (entry) => entry.id,
      ),
    ).toEqual(["trend-1", "trend-2", "trend-3", "trend-4"]);
  });

  it("mixes taste picks with trending titles and never repeats one", () => {
    const ids = (values: string[]) => values.map((id) => ({ id }));
    expect(
      interleaveForDiscovery(
        ids(["p1", "p2", "t2", "p3", "p4"]),
        ids(["t1", "t2", "p1", "t3"]),
      ).map((entry) => entry.id),
    ).toEqual(["p1", "p2", "t1", "t2", "p3", "t3", "p4"]);
  });
});
