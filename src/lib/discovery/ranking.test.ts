import { describe, expect, it } from "vitest";
import type { Movie } from "@/types/movie";
import {
  discoveryScore,
  isEvergreenTitle,
  isFreshTrend,
  isHighConfidenceRating,
  isRecentTitle,
  isRecommendationEligible,
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
});
