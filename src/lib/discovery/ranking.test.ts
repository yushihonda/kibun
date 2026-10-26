import { describe, expect, it } from "vitest";
import type { Movie } from "@/types/movie";
import {
  discoveryScore,
  isEvergreenTitle,
  isFreshTrend,
  isFreshSocialTrend,
  isHighConfidenceRating,
  isNowPlayingTitle,
  isRecentTitle,
  isRecommendationEligible,
  isUpcomingTitle,
  newSeasonLabel,
  trendMomentum,
  socialTrendBoost,
  weightedRating,
} from "./ranking";

const now = new Date("2026-08-07T00:00:00Z");

function title(overrides: Partial<Movie> = {}): Movie {
  return {
    id: "title",
    mediaType: "movie",
    title: "作品",
    overview: "",
    posterUrl: "/placeholder-movie.svg",
    backdropUrl: "/placeholder-movie.svg",
    releaseDate: "2026-07-01",
    runtime: 120,
    voteAverage: 8,
    voteCount: 5_000,
    popularity: 100,
    genres: [],
    emotionalTags: [],
    providers: [],
    ...overrides,
  };
}

describe("discovery ranking", () => {
  it("does not let a handful of votes outrank a proven title", () => {
    const lowConfidence = title({ voteAverage: 9.8, voteCount: 12 });
    const proven = title({ voteAverage: 8, voteCount: 10_000 });

    expect(weightedRating(proven)).toBeGreaterThan(
      weightedRating(lowConfidence),
    );
    expect(isHighConfidenceRating(lowConfidence)).toBe(false);
    expect(isRecommendationEligible(lowConfidence, now)).toBe(false);
  });

  it("expires weekly trends after ten days", () => {
    const fresh = title({ trendingAt: "2026-08-01T00:00:00Z" });
    const stale = title({ trendingAt: "2026-07-20T00:00:00Z" });

    expect(isFreshTrend(fresh, now)).toBe(true);
    expect(isFreshTrend(stale, now)).toBe(false);
    expect(discoveryScore(fresh, now)).toBeGreaterThan(
      discoveryScore(stale, now),
    );
  });

  it("accepts anticipated releases only when they are genuinely trending", () => {
    const anticipated = title({
      releaseDate: "2026-08-28",
      voteAverage: 0,
      voteCount: 0,
      popularity: 120,
      trendingAt: "2026-08-06T00:00:00Z",
    });
    const merelyPopular = { ...anticipated, trendingAt: undefined };

    expect(isFreshTrend(anticipated, now)).toBe(true);
    expect(isRecentTitle(anticipated, now)).toBe(true);
    expect(isRecentTitle(merelyPopular, now)).toBe(false);
  });

  it("accepts titles confirmed by a fresh upcoming or on-the-air feed", () => {
    const upcoming = title({
      releaseDate: "2026-08-28",
      voteAverage: 0,
      voteCount: 0,
      popularity: 30,
      sources: ["upcoming"],
      lastSyncedAt: "2026-08-06T00:00:00Z",
    });

    expect(isUpcomingTitle(upcoming, now)).toBe(true);
    expect(isRecentTitle(upcoming, now)).toBe(true);
    expect(
      isUpcomingTitle(
        { ...upcoming, lastSyncedAt: "2026-07-01T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("requires age, rating and substantial votes for perennial favorites", () => {
    const classic = title({
      releaseDate: "1994-09-23",
      voteAverage: 8.7,
      voteCount: 25_000,
    });

    expect(isEvergreenTitle(classic, now)).toBe(true);
    expect(isEvergreenTitle({ ...classic, voteCount: 200 }, now)).toBe(false);
    expect(isEvergreenTitle(title(), now)).toBe(false);
  });

  it("expires the theatrical marker and never applies it to TV dramas", () => {
    const screening = title({ theatricalAt: "2026-08-05T00:00:00Z" });
    const stale = title({ theatricalAt: "2026-08-01T00:00:00Z" });

    expect(isNowPlayingTitle(screening, now)).toBe(true);
    expect(isNowPlayingTitle(stale, now)).toBe(false);
    expect(isNowPlayingTitle({ ...screening, mediaType: "tv" }, now)).toBe(
      false,
    );
  });

  it("adds a freshness-decayed TikTok trend boost", () => {
    const socialSignals = {
      postCount: 8,
      totalViews: 500_000,
      totalLikes: 50_000,
      totalComments: 2_000,
      totalShares: 1_000,
      averageEngagementRate: 10.6,
      trendScore: 90,
      sentiment: "positive" as const,
      sentimentScore: 0.8,
      topHashtags: ["考察"],
      topics: ["ネタバレ考察"],
      latestPostAt: "2026-08-06T00:00:00Z",
      updatedAt: "2026-08-06T00:00:00Z",
      featuredPosts: [],
    };
    const trending = title({ socialSignals });
    const stale = title({
      socialSignals: {
        ...socialSignals,
        latestPostAt: "2025-08-06T00:00:00Z",
        updatedAt: "2025-08-06T00:00:00Z",
      },
    });

    expect(socialTrendBoost(trending, now)).toBeGreaterThan(15);
    expect(socialTrendBoost(stale, now)).toBeLessThan(1);
    expect(discoveryScore(trending, now)).toBeGreaterThan(
      discoveryScore(title(), now),
    );
  });

  it("uses the latest post time and cannot refresh stale posts by recalculating", () => {
    const socialSignals = {
      postCount: 8,
      totalViews: 500_000,
      totalLikes: 50_000,
      totalComments: 2_000,
      totalShares: 1_000,
      averageEngagementRate: 10.6,
      trendScore: 90,
      sentiment: "positive" as const,
      sentimentScore: 0.8,
      topHashtags: ["考察"],
      topics: ["ネタバレ考察"],
      latestPostAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-08-06T00:00:00Z",
      featuredPosts: [],
    };
    const recalculated = title({ socialSignals });
    const unknownPostDate = title({
      socialSignals: { ...socialSignals, latestPostAt: undefined },
    });

    expect(isFreshSocialTrend(recalculated, now)).toBe(false);
    expect(socialTrendBoost(recalculated, now)).toBe(0);
    expect(isFreshSocialTrend(unknownPostDate, now)).toBe(false);
  });
});

describe("newSeasonLabel", () => {
  const show = (season?: Movie["latestSeason"]) =>
    title({ mediaType: "tv", latestSeason: season });

  it("flags a later season that just started or starts soon", () => {
    expect(
      newSeasonLabel(show({ number: 2, airDate: "2026-07-20" }), now),
    ).toBe("シーズン2 配信中");
    expect(
      newSeasonLabel(show({ number: 3, airDate: "2026-08-15" }), now),
    ).toBe("シーズン3 8/15配信");
  });

  it("ignores first seasons, old seasons, and movies", () => {
    expect(
      newSeasonLabel(show({ number: 1, airDate: "2026-08-01" }), now),
    ).toBeNull();
    expect(
      newSeasonLabel(show({ number: 2, airDate: "2026-01-01" }), now),
    ).toBeNull();
    expect(
      newSeasonLabel(show({ number: 2, airDate: "2026-12-01" }), now),
    ).toBeNull();
    expect(
      newSeasonLabel(
        title({ latestSeason: { number: 2, airDate: "2026-08-01" } }),
        now,
      ),
    ).toBeNull();
  });
});

describe("trendMomentum", () => {
  it("puts current trends ahead of long-standing favorites", () => {
    const classic = title({
      id: "classic",
      releaseDate: "1999-01-01",
      voteAverage: 8.8,
      voteCount: 30_000,
      popularity: 400,
    });
    const weeklyTrend = title({
      id: "weekly",
      releaseDate: "2026-07-20",
      voteAverage: 7.2,
      voteCount: 300,
      trendingAt: "2026-08-06T00:00:00Z",
    });
    const newSeason = title({
      id: "season",
      mediaType: "tv",
      releaseDate: "2022-09-13",
      voteAverage: 8.5,
      latestSeason: { number: 2, airDate: "2026-08-01" },
    });
    expect(trendMomentum(weeklyTrend, now)).toBeGreaterThan(
      trendMomentum(classic, now),
    );
    expect(trendMomentum(newSeason, now)).toBeGreaterThan(
      trendMomentum(classic, now),
    );
  });
});
