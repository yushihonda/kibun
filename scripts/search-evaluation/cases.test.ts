import { describe, expect, it } from "vitest";
import { SEARCH_RELEVANCE_CASES } from "./cases";

describe("search relevance judgments", () => {
  it("covers the four primary mood queries", () => {
    expect(SEARCH_RELEVANCE_CASES.map(({ id }) => id)).toEqual([
      "cry",
      "laugh",
      "comfort",
      "safe",
    ]);
  });

  it.each(SEARCH_RELEVANCE_CASES)(
    "$query has 20-50 balanced, unique curated judgments",
    ({ judgments, relevanceCriteria }) => {
      const relevant = judgments.filter(({ label }) => label === "relevant");
      const irrelevant = judgments.filter(
        ({ label }) => label === "irrelevant",
      );
      const tmdbIds = judgments.map(({ tmdbId }) => tmdbId);

      expect(relevanceCriteria.length).toBeGreaterThan(20);
      expect(judgments.length).toBeGreaterThanOrEqual(20);
      expect(judgments.length).toBeLessThanOrEqual(50);
      expect(relevant).toHaveLength(12);
      expect(irrelevant).toHaveLength(12);
      expect(new Set(tmdbIds).size).toBe(tmdbIds.length);
      expect(judgments.every(({ title }) => title.trim().length > 0)).toBe(
        true,
      );
    },
  );
});
