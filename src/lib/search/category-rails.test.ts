import { describe, expect, it } from "vitest";
import type { SearchPlan } from "@/lib/search/query-intent";
import { buildSearchRails } from "./category-rails";
import type { Movie } from "@/types/movie";
import { analyzeSearchQuery } from "./query-intent";

const movie = (
  overrides: Partial<Movie> & Pick<Movie, "id" | "title">,
): Movie => ({
  id: overrides.id,
  mediaType: overrides.mediaType ?? "movie",
  title: overrides.title,
  overview: overrides.overview ?? "",
  posterUrl: overrides.posterUrl ?? "",
  backdropUrl: overrides.backdropUrl ?? "",
  releaseDate: overrides.releaseDate ?? "",
  runtime: overrides.runtime ?? 100,
  voteAverage: overrides.voteAverage ?? 7,
  voteCount: overrides.voteCount ?? 1_000,
  popularity: overrides.popularity ?? 10,
  genres: overrides.genres ?? [],
  emotionalTags: overrides.emotionalTags ?? [],
  providers: overrides.providers ?? [],
  matchReasons: overrides.matchReasons,
  editorialComment: overrides.editorialComment,
  video: overrides.video,
  socialSignals: overrides.socialSignals,
});

describe("buildSearchRails", () => {
  it("builds mood and editorial rails for empty query selections", () => {
    const movies = [
      movie({
        id: "1",
        title: "A",
        emotionalTags: ["泣ける"],
        voteAverage: 8,
        providers: [
          { id: 1, name: "Netflix", slug: "netflix", type: "flatrate" },
        ],
        editorialComment: "編集部メモ",
      }),
      movie({
        id: "2",
        title: "B",
        emotionalTags: ["笑える"],
        voteAverage: 7.6,
      }),
      movie({
        id: "3",
        title: "C",
        emotionalTags: ["癒やし"],
        voteAverage: 7.8,
      }),
    ];

    const rails = buildSearchRails(movies, null, {
      emptyQuery: true,
      editorialMovies: [movies[0]],
    });

    expect(rails.map((rail) => rail.id)).toEqual(
      expect.arrayContaining(["editorial", "high-rated", "cry"]),
    );
    expect(rails.find((rail) => rail.id === "editorial")?.movies[0].id).toBe(
      "1",
    );
  });

  it("prioritizes mood rail when search plan is expanded", () => {
    const plan: SearchPlan = analyzeSearchQuery("泣ける");
    const movies = [
      movie({
        id: "tear",
        title: "涙の夜",
        emotionalTags: ["泣ける", "感動"],
        genres: ["ドラマ"],
        matchReasons: ["気分タグ「泣ける」"],
      }),
      movie({
        id: "action",
        title: "爆走",
        genres: ["アクション"],
        voteAverage: 9,
      }),
    ];

    const rails = buildSearchRails(movies, plan);
    expect(
      rails[0]?.id === "editorial" || rails.some((rail) => rail.id === "mood"),
    ).toBe(true);
    expect(rails.some((rail) => rail.id === "mood")).toBe(true);
  });

  it("always separates films and TV dramas into explicit rails", () => {
    const movies = [
      movie({ id: "film", title: "映画作品", mediaType: "movie" }),
      movie({ id: "tv", title: "ドラマ作品", mediaType: "tv" }),
    ];

    const rails = buildSearchRails(movies, null);

    expect(rails.find((rail) => rail.id === "movies")?.movies).toEqual([
      expect.objectContaining({ id: "film", mediaType: "movie" }),
    ]);
    expect(rails.find((rail) => rail.id === "dramas")?.movies).toEqual([
      expect.objectContaining({ id: "tv", mediaType: "tv" }),
    ]);
  });

  it("separates TikTok-trending films and dramas into dedicated rails", () => {
    const socialSignals = {
      postCount: 3,
      totalViews: 100_000,
      totalLikes: 10_000,
      totalComments: 100,
      totalShares: 50,
      averageEngagementRate: 10.2,
      trendScore: 75,
      sentiment: "positive" as const,
      sentimentScore: 0.7,
      topHashtags: [],
      topics: [],
      updatedAt: "2026-08-08T00:00:00Z",
      featuredPosts: [],
    };
    const rails = buildSearchRails(
      [
        movie({ id: "film-social", title: "映画", socialSignals }),
        movie({
          id: "tv-social",
          title: "ドラマ",
          mediaType: "tv",
          socialSignals,
        }),
      ],
      null,
    );

    expect(rails.find((rail) => rail.id === "tiktok-movies")?.movies).toEqual([
      expect.objectContaining({ id: "film-social", mediaType: "movie" }),
    ]);
    expect(rails.find((rail) => rail.id === "tiktok-dramas")?.movies).toEqual([
      expect.objectContaining({ id: "tv-social", mediaType: "tv" }),
    ]);
  });
});
