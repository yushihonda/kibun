import { describe, expect, it } from "vitest";
import type { Movie } from "@/types/movie";
import {
  analyzeSearchQuery,
  explainMovieReasons,
  rankSearchBatches,
} from "./query-intent";

const movie = (
  overrides: Partial<Movie> & Pick<Movie, "id" | "title">,
): Movie => {
  const { id, title, ...rest } = overrides;
  return {
    id,
    mediaType: "movie",
    title,
    overview: "",
    posterUrl: "",
    backdropUrl: "",
    releaseDate: "",
    runtime: 100,
    voteAverage: 7,
    popularity: 10,
    genres: [],
    emotionalTags: [],
    providers: [],
    ...rest,
  };
};

describe("analyzeSearchQuery", () => {
  it("turns an emotional natural-language request into searchable intents", () => {
    const plan = analyzeSearchQuery("仕事で疲れたから、何も考えずに笑いたい");

    expect(plan.labels).toEqual(
      expect.arrayContaining(["癒やし・心温まる", "笑える・気楽"]),
    );
    expect(plan.queries.map(({ text }) => text)).toContain("コメディ");
    expect(plan.preferredGenres["コメディ"]).toBeGreaterThan(0);
    expect(plan.avoidedGenres["ホラー"]).toBeGreaterThan(0);
  });

  it("covers conversational inflections that previously returned zero results", () => {
    const plan = analyzeSearchQuery("泣いてスッキリしたい");

    expect(plan.labels).toContain("泣ける・感動");
    expect(plan.queries.map(({ text }) => text)).toContain("ドラマ");
    expect(plan.expanded).toBe(true);
  });

  it("combines context such as a quiet night with the requested mood", () => {
    const plan = analyzeSearchQuery("一人で静かな夜に余韻のある映画が観たい");

    expect(plan.labels).toEqual(
      expect.arrayContaining(["深い・考えさせられる", "静か・余韻"]),
    );
    expect(plan.avoidedGenres["アクション"]).toBeGreaterThan(0);
  });

  it("falls back to recommendations for a vague movie request", () => {
    const plan = analyzeSearchQuery("なんかいい映画ない？");

    expect(plan.labels).toContain("おすすめ");
    expect(plan.queries.some(({ text }) => text === "")).toBe(true);
  });

  it("expands Japanese and Korean regional requests without global fallback", () => {
    const japanese = analyzeSearchQuery("最近の邦画でおすすめ");
    const korean = analyzeSearchQuery("韓国系の泣ける作品");

    expect(japanese.labels).toContain("邦画");
    expect(japanese.inferredOriginCountries).toEqual(["JP"]);
    expect(japanese.inferredMediaTypes).toEqual(["movie"]);
    expect(japanese.inferredMinVoteCount).toBeNull();
    expect(japanese.queries.map(({ text }) => text)).toContain("邦画");
    expect(japanese.queries.some(({ text }) => text === "")).toBe(false);
    expect(korean.labels).toEqual(
      expect.arrayContaining(["韓国映画", "泣ける・感動"]),
    );
    expect(korean.queries.map(({ text }) => text)).toContain("韓国映画");
    expect(korean.inferredOriginCountries).toEqual(["KR"]);
    expect(korean.inferredMediaTypes).toEqual(["movie"]);
    expect(korean.inferredMinVoteCount).toBeNull();
    expect(korean.queries.map(({ text }) => text)).toContain("韓国映画 ドラマ");
    expect(korean.queries.map(({ text }) => text)).not.toContain("ドラマ");
  });

  it("does not hide low-vote new titles from regional mood searches", () => {
    const plan = analyzeSearchQuery("邦画の感動系");

    expect(plan.inferredOriginCountries).toEqual(["JP"]);
    expect(plan.preferredEmotionalTags).toContain("感動");
    expect(plan.inferredMinVoteCount).toBeNull();
  });

  it("understands implicit runtime, quality and provider constraints", () => {
    const plan = analyzeSearchQuery("アマプラで90分以内の評価が高い映画");

    expect(plan.inferredProviderSlugs).toEqual(["prime-video"]);
    expect(plan.inferredMaxRuntime).toBe(90);
    expect(plan.inferredMinRating).toBe(7.5);
    expect(plan.queries.some(({ text }) => text === "")).toBe(true);
  });

  it("expands short mood keywords into searchable intents", () => {
    const cry = analyzeSearchQuery("泣ける");
    const laugh = analyzeSearchQuery("笑える");

    expect(cry.expanded).toBe(true);
    expect(cry.labels).toContain("泣ける・感動");
    expect(cry.preferredEmotionalTags).toEqual(
      expect.arrayContaining(["泣ける", "感動"]),
    );
    expect(laugh.preferredGenres["コメディ"]).toBeGreaterThan(0);
  });

  it("caps intent queries to protect the search database", () => {
    expect(analyzeSearchQuery("泣ける映画を家族で見たい").queries).toHaveLength(
      6,
    );
  });

  it("treats horror negation as an avoidance signal", () => {
    const plan = analyzeSearchQuery("怖くない映画を家族で見たい");

    expect(plan.labels).toContain("怖くない・安心");
    expect(plan.labels).not.toContain("怖い・不穏");
    expect(plan.avoidedGenres["ホラー"]).toBeGreaterThan(0);
    expect(plan.preferredGenres["ホラー"]).toBeUndefined();
    expect(plan.strictAvoidedGenres).toEqual(["ホラー", "スリラー"]);
  });
});

describe("rankSearchBatches", () => {
  it("keeps a literal title match ahead of semantic expansions", () => {
    const plan = analyzeSearchQuery("人生");
    const exact = movie({ id: "exact", title: "人生" });
    const popular = movie({
      id: "popular",
      title: "別の映画",
      voteAverage: 9.5,
      popularity: 999,
    });

    expect(
      rankSearchBatches(
        [{ query: plan.queries[0], movies: [popular, exact] }],
        plan,
      ).map(({ id }) => id),
    ).toEqual(["exact", "popular"]);
  });

  it("removes explicitly avoided genres from safe-viewing results", () => {
    const plan = analyzeSearchQuery("疲れたから癒やされたい。怖くないもの");
    const gentle = movie({
      id: "gentle",
      title: "やさしい休日",
      overview: "家族と友情を描く穏やかな日常",
      genres: ["ファミリー", "ドラマ"],
      emotionalTags: ["癒やし", "ほっこり"],
    });
    const horror = movie({
      id: "horror",
      title: "恐怖の休日",
      genres: ["ホラー"],
      voteAverage: 9,
      popularity: 999,
    });

    expect(
      rankSearchBatches(
        [{ query: plan.queries[0], movies: [horror, gentle] }],
        plan,
      ).map(({ id }) => id),
    ).toEqual(["gentle"]);
  });

  it("prefers emotional-tag matches over raw popularity for mood queries", () => {
    const plan = analyzeSearchQuery("泣ける");
    const tearjerker = movie({
      id: "tearjerker",
      title: "さよならの朝に",
      overview: "別れと絆を描く家族の物語",
      genres: ["ドラマ"],
      emotionalTags: ["泣ける", "感動"],
      voteAverage: 7.2,
      popularity: 20,
    });
    const popular = movie({
      id: "popular",
      title: "爆走アクション",
      genres: ["アクション"],
      voteAverage: 9,
      popularity: 999,
    });

    expect(
      rankSearchBatches(
        [{ query: plan.queries[0], movies: [popular, tearjerker] }],
        plan,
      )[0].id,
    ).toBe("tearjerker");
  });

  it("uses a fresh TikTok hashtag as a capped auxiliary ranking signal", () => {
    const plan = analyzeSearchQuery("伏線考察");
    const social = movie({
      id: "social",
      title: "静かな事件",
      socialSignals: {
        postCount: 4,
        totalViews: 50_000,
        totalLikes: 5_000,
        totalComments: 100,
        totalShares: 20,
        averageEngagementRate: 10,
        trendScore: 60,
        sentiment: "positive",
        sentimentScore: 0.5,
        topHashtags: ["伏線考察"],
        topics: [],
        latestPostAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        featuredPosts: [],
      },
    });
    const unrelated = movie({ id: "unrelated", title: "別の作品" });

    expect(
      rankSearchBatches(
        [{ query: plan.queries[0], movies: [unrelated, social] }],
        plan,
      )[0].id,
    ).toBe("social");
    expect(explainMovieReasons(social, plan)).toContain(
      "TikTokの「#伏線考察」に一致",
    );
  });

  it("keeps an exact official title ahead of a TikTok-only match", () => {
    const plan = analyzeSearchQuery("伏線考察");
    const exact = movie({ id: "exact-social-title", title: "伏線考察" });
    const social = movie({
      id: "social-only",
      title: "別の話題作",
      socialSignals: {
        postCount: 100,
        totalViews: 10_000_000,
        totalLikes: 1_000_000,
        totalComments: 10_000,
        totalShares: 2_000,
        averageEngagementRate: 10,
        trendScore: 100,
        sentiment: "positive",
        sentimentScore: 0.9,
        topHashtags: ["伏線考察"],
        topics: [],
        latestPostAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        featuredPosts: [],
      },
    });

    expect(
      rankSearchBatches(
        [{ query: plan.queries[0], movies: [social, exact] }],
        plan,
      )[0].id,
    ).toBe("exact-social-title");
  });

  it("uses bounded user preferences only to reorder similarly relevant titles", () => {
    const plan = analyzeSearchQuery("人生");
    const exact = movie({ id: "exact-personalized", title: "人生" });
    const preferred = movie({
      id: "preferred",
      title: "別の映画",
      genres: ["ホラー"],
      emotionalTags: ["ゾクゾク"],
      popularity: 999,
    });
    const neutral = movie({ id: "neutral", title: "静かな作品" });
    const ranked = rankSearchBatches(
      [
        {
          query: plan.queries[0],
          movies: [neutral, preferred, exact],
        },
      ],
      plan,
      {
        preferredGenres: ["ホラー"],
        preferredEmotionalTags: ["ゾクゾク"],
      },
    );

    expect(ranked[0].id).toBe("exact-personalized");
    expect(ranked.indexOf(preferred)).toBeLessThan(ranked.indexOf(neutral));
  });

  it("never boosts a saved genre that the current query explicitly avoids", () => {
    const plan = analyzeSearchQuery("疲れたから癒やされたい。怖くないもの");
    const gentle = movie({
      id: "gentle-current-intent",
      title: "穏やかな休日",
      genres: ["ファミリー"],
      emotionalTags: ["癒やし"],
    });
    const horror = movie({
      id: "saved-but-avoided",
      title: "恐怖の休日",
      genres: ["ホラー"],
      emotionalTags: ["ゾクゾク"],
      popularity: 999,
    });

    expect(
      rankSearchBatches(
        [{ query: plan.queries[0], movies: [horror, gentle] }],
        plan,
        {
          preferredGenres: ["ホラー"],
          preferredEmotionalTags: ["ゾクゾク"],
        },
      )[0].id,
    ).toBe("gentle-current-intent");
  });
});
