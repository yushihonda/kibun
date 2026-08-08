import { describe, expect, it, vi } from "vitest";
import {
  parseTikTokSearchResponse,
  TikTokRapidApiClient,
} from "./tiktok-client";
import { scoreTikTokTitleRelevance } from "./tiktok-relevance";

describe("TikTok RapidAPI adapter", () => {
  it("normalizes flat sample fields from the requested API", () => {
    const posts = parseTikTokSearchResponse({
      data: [
        {
          id: "123456789",
          title: "作品名が最高 #作品名 #考察",
          play_count: 12_000,
          digg_count: 1_200,
          comment_count: 80,
          share_count: 40,
          share_url: "https://www.tiktok.com/@creator/video/123456789",
          create_time: 1_785_945_600,
          hashtags: [{ name: "作品名" }, { name: "考察" }],
          author: { unique_id: "creator" },
        },
      ],
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      videoId: "123456789",
      views: 12_000,
      likes: 1_200,
      comments: 80,
      shares: 40,
      authorUsername: "creator",
      hashtags: ["作品名", "考察"],
    });
  });

  it("normalizes nested TikTok response variants", () => {
    const posts = parseTikTokSearchResponse({
      data: {
        videos: [
          {
            aweme_id: "987654321",
            desc: "ドラマ名のロケ地",
            statistics: {
              play_count: "5000",
              digg_count: "600",
              comment_count: "12",
              share_count: "8",
            },
            text_extra: [{ hashtag_name: "ロケ地" }],
            author: { uniqueId: "fan" },
          },
        ],
      },
    });
    expect(posts[0]).toMatchObject({
      videoId: "987654321",
      views: 5_000,
      likes: 600,
      hashtags: ["ロケ地"],
    });
    expect(posts[0].url).toContain("/@fan/video/987654321");
  });

  it("keeps short ambiguous titles only when an exact hashtag matches", () => {
    expect(
      scoreTikTokTitleRelevance(
        { caption: "キングの感想", hashtags: [] },
        "キング",
      ),
    ).toBeGreaterThanOrEqual(0.7);
    expect(
      scoreTikTokTitleRelevance({ caption: "愛について", hashtags: [] }, "愛"),
    ).toBe(0);
    expect(
      scoreTikTokTitleRelevance(
        { caption: "おすすめ", hashtags: ["愛"] },
        "愛",
      ),
    ).toBe(1);
  });

  it("sends credentials only in server-side RapidAPI headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new TikTokRapidApiClient({
      apiKey: "secret",
      fetchImpl,
    });
    await client.search("作品名 映画");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-RapidAPI-Key": "secret",
          "X-RapidAPI-Host": "tiktok-all-in-one-api.p.rapidapi.com",
        }),
      }),
    );
  });
});
