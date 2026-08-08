import { describe, expect, it } from "vitest";
import {
  aggregateTikTokSignals,
  analyzeSentimentFallback,
  calculateEngagementRate,
  calculatePostTrendScore,
  classifySocialTopics,
} from "./tiktok-signals";

const now = new Date("2026-08-08T00:00:00.000Z");

function post(overrides: Record<string, unknown> = {}) {
  const views = Number(overrides.views ?? 10_000);
  const likes = Number(overrides.likes ?? 1_000);
  const comments = Number(overrides.comments ?? 100);
  const shares = Number(overrides.shares ?? 50);
  return {
    videoId: String(overrides.videoId ?? "123"),
    url: "https://www.tiktok.com/@creator/video/123",
    caption: String(overrides.caption ?? "最高の映画 #考察 #ロケ地"),
    authorUsername: "creator",
    postedAt: String(overrides.postedAt ?? "2026-08-07T00:00:00.000Z"),
    views,
    likes,
    comments,
    shares,
    engagementRate: calculateEngagementRate({ views, likes, comments, shares }),
    hashtags: (overrides.hashtags as string[] | undefined) ?? [
      "作品名",
      "考察",
      "ロケ地",
    ],
  };
}

describe("TikTok social signals", () => {
  it("calculates engagement as interactions divided by views", () => {
    expect(
      calculateEngagementRate({
        views: 10_000,
        likes: 500,
        comments: 100,
        shares: 50,
      }),
    ).toBe(6.5);
    expect(
      calculateEngagementRate({ views: 0, likes: 10, comments: 2, shares: 1 }),
    ).toBe(0);
  });

  it("gives fresher high-engagement posts a stronger trend score", () => {
    const fresh = post({ postedAt: "2026-08-07T00:00:00.000Z" });
    const stale = post({ postedAt: "2025-08-07T00:00:00.000Z" });
    expect(calculatePostTrendScore(fresh, now)).toBeGreaterThan(
      calculatePostTrendScore(stale, now),
    );
  });

  it("classifies common movie and drama discussion topics", () => {
    expect(
      classifySocialTopics("原作との比較とラストの伏線を考察", ["聖地巡礼"]),
    ).toEqual(expect.arrayContaining(["ネタバレ考察", "原作比較", "ロケ地"]));
  });

  it("aggregates hashtags, metrics, topics and featured posts", () => {
    const result = aggregateTikTokSignals(
      [
        post(),
        post({
          videoId: "456",
          views: 50_000,
          likes: 10_000,
          comments: 800,
          shares: 400,
          caption: "原作比較レビュー",
          hashtags: ["作品名", "原作比較", "考察"],
        }),
      ],
      { excludedHashtags: ["作品名"], now },
    );
    expect(result.postCount).toBe(2);
    expect(result.totalViews).toBe(60_000);
    expect(result.topHashtags).not.toContain("作品名");
    expect(result.topHashtags[0]).toBe("考察");
    expect(result.topics).toEqual(expect.arrayContaining(["原作比較"]));
    expect(result.featuredPosts[0].videoId).toBe("456");
    expect(result.trendScore).toBeGreaterThan(0);
  });

  it("provides a deterministic sentiment fallback", () => {
    expect(analyzeSentimentFallback(["最高で面白い。おすすめ"])).toEqual({
      sentiment: "positive",
      sentimentScore: 1,
    });
    expect(analyzeSentimentFallback(["微妙で残念"])).toEqual({
      sentiment: "negative",
      sentimentScore: -1,
    });
  });
});
