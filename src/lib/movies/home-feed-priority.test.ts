import { describe, expect, it } from "vitest";
import { prioritizeHomeFeedSections } from "@/lib/movies/home-feed-priority";
import type { Movie, MovieRail } from "@/types/movie";

function movie(id: string, hasVideo = false): Movie {
  return {
    id,
    mediaType: "movie",
    title: id,
    overview: "overview",
    posterUrl: "/poster.jpg",
    backdropUrl: "/backdrop.jpg",
    releaseDate: "2026-10-01",
    runtime: 120,
    voteAverage: 8,
    popularity: 100,
    genres: [],
    emotionalTags: [],
    providers: [],
    video: hasVideo
      ? { platform: "youtube", videoId: `video-${id}` }
      : undefined,
  };
}

describe("prioritizeHomeFeedSections", () => {
  it("puts video titles first while preserving source recommendation order", () => {
    const sections: MovieRail[] = [
      {
        id: "recommended",
        title: "おすすめ",
        movies: [movie("recommended-image"), movie("recommended-video", true)],
      },
      {
        id: "recent",
        title: "新作",
        movies: [movie("recent-video", true), movie("recent-image")],
      },
    ];

    const result = prioritizeHomeFeedSections(sections, { limit: 4 });

    expect(result[0]).toMatchObject({
      id: "video-picks",
      movies: [
        expect.objectContaining({ id: "recommended-video" }),
        expect.objectContaining({ id: "recent-video" }),
      ],
    });
    expect(
      result.flatMap((section) => section.movies).map(({ id }) => id),
    ).toEqual([
      "recommended-video",
      "recent-video",
      "recommended-image",
      "recent-image",
    ]);
  });

  it("deduplicates titles and respects the total and video limits", () => {
    const shared = movie("shared-video", true);
    const sections: MovieRail[] = [
      { id: "first", title: "First", movies: [shared, movie("video-2", true)] },
      { id: "second", title: "Second", movies: [shared, movie("image-1")] },
    ];

    const result = prioritizeHomeFeedSections(sections, {
      limit: 3,
      videoLimit: 1,
    });
    const ids = result.flatMap((section) => section.movies.map(({ id }) => id));

    expect(ids).toEqual(["shared-video", "video-2", "image-1"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lets a ranker reorder every playable title before the video cut", () => {
    const sections: MovieRail[] = [
      {
        id: "a",
        title: "A",
        description: "",
        movies: [movie("a1", true), movie("a2", true)],
      },
      {
        id: "b",
        title: "B",
        description: "",
        movies: [movie("b1", true), movie("b2")],
      },
    ];
    const result = prioritizeHomeFeedSections(sections, {
      limit: 10,
      videoLimit: 2,
      rankVideos: (movies) => [...movies].reverse(),
    });
    expect(result[0].movies.map((entry) => entry.id)).toEqual(["b1", "a2"]);
    expect(
      result.flatMap((rail) => rail.movies).map((entry) => entry.id),
    ).toEqual(["b1", "a2", "a1", "b2"]);
  });
});
