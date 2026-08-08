import { describe, expect, it } from "vitest";
import {
  prioritizeLeastRecentlyRefreshed,
  selectBalancedMediaCandidates,
  selectRotatingCandidates,
} from "./tiktok-candidates";

describe("TikTok sync candidate rotation", () => {
  it("refreshes unseen and oldest titles before repeating fresh titles", () => {
    const candidates = [
      { id: "fresh", priority: 100 },
      { id: "unseen", priority: 10 },
      { id: "old", priority: 20 },
    ];
    const ordered = prioritizeLeastRecentlyRefreshed(
      candidates,
      new Map([
        ["fresh", Date.parse("2026-08-08T00:00:00Z")],
        ["old", Date.parse("2026-07-01T00:00:00Z")],
      ]),
      (candidate) => candidate.priority,
    );

    expect(ordered.map((candidate) => candidate.id)).toEqual([
      "unseen",
      "old",
      "fresh",
    ]);
  });

  it("reserves daily coverage for both movies and TV dramas", () => {
    const candidates = [
      { id: "movie-1", media_type: "movie" as const },
      { id: "movie-2", media_type: "movie" as const },
      { id: "tv-1", media_type: "tv" as const },
      { id: "movie-3", media_type: "movie" as const },
    ];

    expect(
      selectBalancedMediaCandidates(candidates, 3).map((item) => item.id),
    ).toEqual(["movie-1", "tv-1", "movie-2"]);
  });

  it("rotates through one candidate per UTC day", () => {
    const candidates = ["a", "b", "c"];
    const first = selectRotatingCandidates(
      candidates,
      1,
      new Date("2026-08-08T23:59:59Z"),
    );
    const next = selectRotatingCandidates(
      candidates,
      1,
      new Date("2026-08-09T00:00:00Z"),
    );
    expect(first).toHaveLength(1);
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(first);
  });

  it("wraps a multi-title selection without duplicates", () => {
    expect(
      selectRotatingCandidates(
        ["a", "b", "c"],
        2,
        new Date("2026-08-08T00:00:00Z"),
      ),
    ).toHaveLength(2);
  });

  it("advances once per configured two-day sync interval", () => {
    const candidates = ["a", "b", "c"];
    const first = selectRotatingCandidates(
      candidates,
      1,
      new Date("1970-01-01T00:00:00Z"),
      2,
    );
    const sameInterval = selectRotatingCandidates(
      candidates,
      1,
      new Date("1970-01-02T00:00:00Z"),
      2,
    );
    const nextInterval = selectRotatingCandidates(
      candidates,
      1,
      new Date("1970-01-03T00:00:00Z"),
      2,
    );
    expect(sameInterval).toEqual(first);
    expect(nextInterval).not.toEqual(first);
  });
});
