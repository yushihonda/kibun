import { describe, expect, it, vi } from "vitest";
import {
  parseTikTokSearchResponse,
  TikTokRapidApiClient,
} from "./tiktok-client";
import {
  matchesTikTokTargetRegion,
  scoreTikTokTitleRelevance,
} from "./tiktok-relevance";
import { MANUAL_TV_METADATA } from "../sync/manual-metadata";

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

  it("normalizes the TokApi mobile search response", () => {
    const posts = parseTikTokSearchResponse({
      aweme_list: [],
      search_item_list: [
        {
          aweme_info: {
            aweme_id: "7212345678901234567",
            desc: "新作映画の感想 #新作映画 #映画好き",
            create_time: 1_785_945_600,
            author: { unique_id: "cinema_fan", region: "jp" },
            statistics: {
              play_count: 45_000,
              digg_count: 3_200,
              comment_count: 180,
              share_count: 95,
            },
            text_extra: [
              { hashtag_name: "新作映画" },
              { hashtag_name: "映画好き" },
            ],
            video: { duration: 42_000 },
          },
          position: 0,
        },
      ],
    });
    expect(posts[0]).toMatchObject({
      videoId: "7212345678901234567",
      authorUsername: "cinema_fan",
      regionCode: "JP",
      views: 45_000,
      likes: 3_200,
      comments: 180,
      shares: 95,
      hashtags: ["新作映画", "映画好き"],
      durationSeconds: 42,
    });
  });

  it("normalizes the tiktok-api23 keyword discovery response", () => {
    const posts = parseTikTokSearchResponse({
      hasMore: true,
      videoList: [
        {
          id: "7226469547300146433",
          desc: "映画名の考察 #映画名 #伏線",
          createTime: 1_682_543_565,
          author: { uniqueId: "movie_fan" },
          stats: {
            playCount: 23_000_000,
            diggCount: 642_300,
            commentCount: 10_200,
            shareCount: 80_200,
          },
          textExtra: [{ hashtagName: "映画名" }, { hashtagName: "伏線" }],
          video: { duration: 60 },
        },
      ],
    });
    expect(posts[0]).toMatchObject({
      videoId: "7226469547300146433",
      authorUsername: "movie_fan",
      views: 23_000_000,
      likes: 642_300,
      comments: 10_200,
      shares: 80_200,
      hashtags: ["映画名", "伏線"],
      durationSeconds: 60,
    });
  });

  it("counts new-season posts for a show that lists its seasons together", () => {
    const show = MANUAL_TV_METADATA[105248];
    for (const caption of [
      "エッジランナーズ2 やばすぎる",
      "サイバーパンク エッジランナーズ S2 観た",
      "#エッジランナーズ2 #anime",
      "エッジランナーズ 一気見した",
    ]) {
      expect(
        scoreTikTokTitleRelevance(
          { caption, hashtags: [] },
          show.title!,
          show.aliases,
        ),
      ).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("leaves later-season posts to a separate sequel entry", () => {
    const season1 = [
      "サイバーパンク エッジランナーズ",
      ["エッジランナーズ"],
    ] as const;
    const season2 = [
      "サイバーパンク エッジランナーズ2",
      ["エッジランナーズ2", "エッジランナーズ シーズン2"],
    ] as const;
    const score = (
      caption: string,
      [title, aliases]: typeof season1 | typeof season2,
    ) =>
      scoreTikTokTitleRelevance({ caption, hashtags: [] }, title, [...aliases]);

    for (const caption of [
      "エッジランナーズ2 やばすぎる",
      "エッジランナーズ シーズン2 最高",
      "#エッジランナーズ2 #anime",
      "サイバーパンク エッジランナーズ S2 観た",
    ]) {
      expect(score(caption, season1)).toBe(0);
      expect(score(caption, season2)).toBeGreaterThanOrEqual(0.7);
    }
    expect(
      score("エッジランナーズ 2回目の視聴", season1),
    ).toBeGreaterThanOrEqual(0.7);
    expect(
      score("エッジランナーズ 2022年の名作", season1),
    ).toBeGreaterThanOrEqual(0.7);
    expect(
      score("エッジランナーズ2 の前に エッジランナーズ を復習", season1),
    ).toBeGreaterThanOrEqual(0.7);
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

  it("keeps JP and provider-implied posts while rejecting other regions", () => {
    expect(matchesTikTokTargetRegion({ regionCode: "JP" })).toBe(true);
    expect(matchesTikTokTargetRegion({ regionCode: undefined })).toBe(true);
    expect(matchesTikTokTargetRegion({ regionCode: "KR" })).toBe(false);
  });

  it("paginates TokApi mobile with its keyword, cursor, and JP filters", async () => {
    const item = (id: number) => ({
      aweme_id: String(700_000_000 + id),
      desc: `作品名の感想 ${id}`,
      author: { unique_id: `fan${id}` },
      statistics: { play_count: 1_000 + id },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            has_more: 1,
            cursor: 5,
            aweme_list: Array.from({ length: 5 }, (_, index) => item(index)),
            status_code: 0,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            has_more: 0,
            cursor: 8,
            aweme_list: Array.from({ length: 3 }, (_, index) =>
              item(index + 5),
            ),
            status_code: 0,
          }),
          { status: 200 },
        ),
      );
    const client = new TikTokRapidApiClient({
      apiKey: "secret",
      fetchImpl,
    });
    const posts = await client.search("作品名", { region: "jp", count: 8 });
    expect(posts).toHaveLength(8);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-RapidAPI-Key": "secret",
          "X-RapidAPI-Host": "tokapi-mobile-version.p.rapidapi.com",
        }),
      }),
    );
    const firstUrl = fetchImpl.mock.calls[0]?.[0] as URL;
    const secondUrl = fetchImpl.mock.calls[1]?.[0] as URL;
    expect(firstUrl.pathname).toBe("/v1/search/post");
    expect(firstUrl.searchParams.get("keyword")).toBe("作品名");
    expect(firstUrl.searchParams.get("count")).toBe("8");
    expect(firstUrl.searchParams.get("offset")).toBe("0");
    expect(firstUrl.searchParams.get("region")).toBe("JP");
    expect(firstUrl.searchParams.get("sort_type")).toBe("0");
    expect(firstUrl.searchParams.get("publish_time")).toBe("90");
    expect(secondUrl.searchParams.get("count")).toBe("3");
    expect(secondUrl.searchParams.get("offset")).toBe("5");
  });

  it("honors the request budget even when the provider has another page", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          has_more: 1,
          cursor: 1,
          aweme_list: [
            {
              aweme_id: "7212345678901234567",
              desc: "作品名の感想",
              author: { unique_id: "fan" },
              statistics: { play_count: 5_000 },
            },
          ],
          status_code: 0,
        }),
        { status: 200 },
      ),
    );
    const client = new TikTokRapidApiClient({
      apiKey: "secret",
      fetchImpl,
    });

    const posts = await client.search("作品名", {
      region: "JP",
      count: 10,
      maxPages: 1,
    });

    expect(posts).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retains tiktok-api23 keyword and page pagination when configured", async () => {
    const item = (id: number) => ({
      id: String(700_000_000 + id),
      desc: `作品名の感想 ${id}`,
      author: { uniqueId: `fan${id}` },
      stats: { playCount: 1_000 + id },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hasMore: true,
            videoList: Array.from({ length: 5 }, (_, index) => item(index)),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hasMore: false,
            videoList: Array.from({ length: 5 }, (_, index) => item(index + 5)),
          }),
          { status: 200 },
        ),
      );
    const client = new TikTokRapidApiClient({
      apiKey: "secret",
      provider: "tiktok-api23",
      fetchImpl,
    });
    const posts = await client.search("作品名", { count: 8 });
    expect(posts).toHaveLength(8);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-RapidAPI-Key": "secret",
          "X-RapidAPI-Host": "tiktok-api23.p.rapidapi.com",
        }),
      }),
    );
    const firstUrl = fetchImpl.mock.calls[0]?.[0] as URL;
    const secondUrl = fetchImpl.mock.calls[1]?.[0] as URL;
    expect(firstUrl.pathname).toBe("/api/post/discover");
    expect(firstUrl.searchParams.get("keyword")).toBe("作品名");
    expect(firstUrl.searchParams.get("page")).toBe("1");
    expect(secondUrl.searchParams.get("page")).toBe("2");
  });

  it("retains the original all-in-one provider contract when configured", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    const client = new TikTokRapidApiClient({
      apiKey: "secret",
      provider: "all-in-one",
      host: "tiktok-all-in-one-api.p.rapidapi.com",
      fetchImpl,
    });
    await client.search("作品名 映画", { region: "JP", count: 30 });
    const url = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe("/search/video");
    expect(url.searchParams.get("keywords")).toBe("作品名 映画");
    expect(url.searchParams.get("region")).toBe("JP");
    expect(url.searchParams.get("count")).toBe("30");
  });

  it("surfaces provider errors returned inside an HTTP 200 response", async () => {
    const client = new TikTokRapidApiClient({
      apiKey: "secret",
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status_code: 10_216,
            status_msg: "Search failed",
          }),
          { status: 200 },
        ),
      ),
    });
    await expect(client.search("作品名 映画", { count: 10 })).rejects.toThrow(
      "provider status 10216: Search failed",
    );
  });
});
