import { describe, expect, it } from "vitest";
import { demoMovies } from "@/data/demo-movies";
import { filterDemoMovies, parseSearchFilters } from "./filters";

describe("parseSearchFilters", () => {
  it("keeps the SearchExperience query contract and converts stars", () => {
    const filters = parseSearchFilters(
      new URLSearchParams({
        q: "  爽快  ",
        limit: "30",
        offerTypes: "flatrate,invalid",
        maxRuntime: "90",
        minRating: "4",
        providers: "Netflix",
      }),
    );

    expect(filters).toMatchObject({
      query: "爽快",
      limit: 30,
      offerTypes: ["flatrate"],
      maxRuntime: 90,
      minRating: 8,
      providers: ["netflix"],
    });
  });

  it("bounds unsafe values", () => {
    const filters = parseSearchFilters(
      new URLSearchParams({
        q: "x".repeat(600),
        limit: "1000",
        offset: "-1",
        maxRuntime: "NaN",
      }),
    );

    expect(filters.query).toHaveLength(500);
    expect(filters.limit).toBe(30);
    expect(filters.offset).toBe(0);
    expect(filters.maxRuntime).toBeNull();
  });
});

describe("filterDemoMovies", () => {
  it("applies provider, offer, runtime and rating together", () => {
    const filters = parseSearchFilters(
      new URLSearchParams({
        providers: "netflix",
        offerTypes: "flatrate",
        maxRuntime: "130",
        minRating: "3.5",
      }),
    );

    expect(
      filterDemoMovies(demoMovies, filters).map((movie) => movie.id),
    ).toEqual(["demo-perfect-days"]);
  });
});
