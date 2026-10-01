import { describe, expect, it } from "vitest";
import { normalizedRuntime, sourceConfig } from "./tmdb";

describe("TMDB source routing", () => {
  it("uses the current release feeds for films and TV", () => {
    expect(sourceConfig("movie", "now_playing").path).toBe(
      "/movie/now_playing",
    );
    expect(sourceConfig("tv", "now_playing").path).toBe("/tv/airing_today");
  });

  it("uses the upcoming film and on-the-air TV feeds", () => {
    expect(sourceConfig("movie", "upcoming").path).toBe("/movie/upcoming");
    expect(sourceConfig("tv", "upcoming").path).toBe("/tv/on_the_air");
  });

  it("restricts the Japanese catalog to Japanese productions", () => {
    expect(
      sourceConfig("movie", "japan", { releaseDateFrom: "2023-01-01" }),
    ).toEqual({
      path: "/discover/movie",
      params: {
        sort_by: "popularity.desc",
        include_adult: false,
        with_origin_country: "JP",
        "primary_release_date.gte": "2023-01-01",
      },
    });
  });
});

describe("TMDB runtime normalization", () => {
  it("keeps realistic runtimes and rejects invalid provider values", () => {
    expect(normalizedRuntime(120)).toBe(120);
    expect(normalizedRuntime(0)).toBeNull();
    expect(normalizedRuntime(2_640)).toBeNull();
    expect(normalizedRuntime(6_250)).toBeNull();
  });
});
