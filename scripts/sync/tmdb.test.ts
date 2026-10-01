import { describe, expect, it } from "vitest";
import { sourceConfig } from "./tmdb";

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
});
