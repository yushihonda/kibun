import { describe, expect, it } from "vitest";
import type { MovieSocialSignals } from "@/types/movie";
import {
  findSocialSignalMatch,
  normalizeSocialSearchTerm,
  socialSignalMatchReason,
} from "./social-signal-match";

const now = new Date("2026-08-08T00:00:00Z");
const signals = (
  overrides: Partial<MovieSocialSignals> = {},
): MovieSocialSignals => ({
  postCount: 10,
  totalViews: 100_000,
  totalLikes: 10_000,
  totalComments: 500,
  totalShares: 100,
  averageEngagementRate: 10,
  trendScore: 70,
  sentiment: "positive",
  sentimentScore: 0.7,
  topHashtags: ["伏線考察", "ロケ地巡り"],
  topics: ["聖地巡礼"],
  latestPostAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-02T00:00:00Z",
  featuredPosts: [],
  ...overrides,
});

describe("findSocialSignalMatch", () => {
  it("normalizes full-width hashtags and matches exact terms", () => {
    expect(normalizeSocialSearchTerm(" ＃伏線考察 ")).toBe("伏線考察");
    const match = findSocialSignalMatch("#伏線考察", signals(), now);

    expect(match).toMatchObject({ kind: "hashtag", term: "伏線考察" });
    expect(socialSignalMatchReason(match!)).toBe("TikTokの「#伏線考察」に一致");
  });

  it("matches a hashtag contained in a conversational query", () => {
    expect(
      findSocialSignalMatch("伏線考察できる映画", signals(), now),
    ).toMatchObject({ term: "伏線考察" });
  });

  it("allows a small Japanese typo but rejects unrelated terms", () => {
    expect(findSocialSignalMatch("伏線考差", signals(), now)).toMatchObject({
      term: "伏線考察",
    });
    expect(findSocialSignalMatch("料理番組", signals(), now)).toBeNull();
  });

  it("uses topics as a lower-weight auxiliary match", () => {
    const match = findSocialSignalMatch("聖地巡礼", signals(), now);

    expect(match).toMatchObject({ kind: "topic", term: "聖地巡礼" });
    expect(match!.score).toBeLessThan(1);
  });

  it("does not turn generic or stale TikTok tags into candidates", () => {
    expect(
      findSocialSignalMatch(
        "おすすめ",
        signals({ topHashtags: ["おすすめ"] }),
        now,
      ),
    ).toBeNull();
    expect(
      findSocialSignalMatch(
        "伏線考察",
        signals({ latestPostAt: "2026-03-01T00:00:00Z" }),
        now,
      ),
    ).toBeNull();
  });

  it("does not fuzzily match ambiguous two-character terms", () => {
    expect(
      findSocialSignalMatch("考案", signals({ topHashtags: ["考察"] }), now),
    ).toBeNull();
  });
});
