import type {
  MovieSocialSignals,
  SocialPostPreview,
  SocialSentiment,
} from "@/types/movie";

const DAY_MS = 86_400_000;

export type TikTokSignalPost = SocialPostPreview & {
  postedAt?: string;
};

export type SocialAnalysis = {
  sentiment: SocialSentiment;
  sentimentScore: number;
  summary?: string;
  topics?: string[];
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function unique(values: string[], limit: number): string[] {
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, limit);
}

export function calculateEngagementRate(input: {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}): number {
  const views = finiteNonNegative(input.views);
  if (views <= 0) return 0;
  const interactions =
    finiteNonNegative(input.likes) +
    finiteNonNegative(input.comments) +
    finiteNonNegative(input.shares);
  return Math.round((interactions / views) * 100_000) / 1_000;
}

export function calculatePostTrendScore(
  post: TikTokSignalPost,
  now = new Date(),
): number {
  const views = finiteNonNegative(post.views);
  const engagementRate = finiteNonNegative(post.engagementRate);
  const postedAt = post.postedAt ? Date.parse(post.postedAt) : Number.NaN;
  const ageDays = Number.isFinite(postedAt)
    ? Math.max(0, (now.getTime() - postedAt) / DAY_MS)
    : 30;
  const reach = Math.min(1, Math.log10(views + 1) / 7);
  const engagement = Math.min(1, engagementRate / 12);
  const recency = Math.exp(-ageDays / 21);
  return (
    Math.round((reach * 0.45 + engagement * 0.35 + recency * 0.2) * 1000) / 10
  );
}

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["ネタバレ考察", /ネタバレ|考察|伏線|解説|意味|ラスト|結末/iu],
  ["原作比較", /原作|漫画|小説|実写|改変|比較/iu],
  ["ロケ地", /ロケ地|聖地|撮影地|舞台|巡礼/iu],
  ["キャスト", /キャスト|俳優|女優|主演|演技|推し|役者/iu],
  ["音楽", /主題歌|挿入歌|音楽|サントラ|ost|楽曲/iu],
  ["感想・レビュー", /感想|レビュー|評価|おすすめ|面白|泣け|怖|最高|微妙/iu],
  ["名シーン", /名シーン|名場面|名台詞|セリフ|シーン/iu],
  ["衣装・メイク", /衣装|メイク|ファッション|コーデ|髪型/iu],
];

export function classifySocialTopics(
  caption: string,
  hashtags: string[] = [],
): string[] {
  const text = `${caption} ${hashtags.join(" ")}`;
  return TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([label]) => label,
  );
}

const POSITIVE_PATTERN =
  /最高|面白|好き|おすすめ|感動|泣け|神|尊い|良かった|すごい|鳥肌|傑作|楽し/giu;
const NEGATIVE_PATTERN =
  /つまら|微妙|退屈|最悪|嫌い|残念|がっかり|ひどい|駄作|怖すぎ/giu;

export function analyzeSentimentFallback(
  texts: string[],
): Pick<SocialAnalysis, "sentiment" | "sentimentScore"> {
  const text = texts.join(" ");
  const positive = text.match(POSITIVE_PATTERN)?.length ?? 0;
  const negative = text.match(NEGATIVE_PATTERN)?.length ?? 0;
  const total = positive + negative;
  if (!total) return { sentiment: "neutral", sentimentScore: 0 };
  const score = Math.max(-1, Math.min(1, (positive - negative) / total));
  return {
    sentiment:
      score >= 0.25 ? "positive" : score <= -0.25 ? "negative" : "mixed",
    sentimentScore: Math.round(score * 100) / 100,
  };
}

export function aggregateTikTokSignals(
  posts: TikTokSignalPost[],
  options?: {
    analysis?: SocialAnalysis;
    excludedHashtags?: string[];
    now?: Date;
  },
): MovieSocialSignals {
  const now = options?.now ?? new Date();
  const excluded = new Set(
    (options?.excludedHashtags ?? []).map((tag) => tag.toLocaleLowerCase("ja")),
  );
  const sorted = [...posts].sort(
    (a, b) =>
      calculatePostTrendScore(b, now) - calculatePostTrendScore(a, now) ||
      b.views - a.views ||
      a.videoId.localeCompare(b.videoId),
  );
  const hashtagCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  for (const post of posts) {
    for (const hashtag of unique(post.hashtags, 30)) {
      const normalized = hashtag.replace(/^#/, "").toLocaleLowerCase("ja");
      if (!normalized || excluded.has(normalized)) continue;
      hashtagCounts.set(normalized, (hashtagCounts.get(normalized) ?? 0) + 1);
    }
    for (const topic of classifySocialTopics(post.caption, post.hashtags)) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const analysis: SocialAnalysis = options?.analysis ?? {
    ...analyzeSentimentFallback(posts.map((post) => post.caption)),
    topics: [],
  };
  const averageTopScore =
    sorted
      .slice(0, 5)
      .reduce((sum, post) => sum + calculatePostTrendScore(post, now), 0) /
    Math.max(1, Math.min(5, sorted.length));
  const trendScore = Math.min(
    100,
    averageTopScore * 0.88 + Math.min(12, Math.log2(posts.length + 1) * 3),
  );
  const latestPostAt = posts
    .map((post) => post.postedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const totals = posts.reduce(
    (result, post) => ({
      views: result.views + finiteNonNegative(post.views),
      likes: result.likes + finiteNonNegative(post.likes),
      comments: result.comments + finiteNonNegative(post.comments),
      shares: result.shares + finiteNonNegative(post.shares),
    }),
    { views: 0, likes: 0, comments: 0, shares: 0 },
  );
  const weightedEngagement = calculateEngagementRate(totals);
  const topHashtags = [...hashtagCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, 8)
    .map(([hashtag]) => hashtag);
  const deterministicTopics = [...topicCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([topic]) => topic);

  return {
    postCount: posts.length,
    totalViews: totals.views,
    totalLikes: totals.likes,
    totalComments: totals.comments,
    totalShares: totals.shares,
    averageEngagementRate: weightedEngagement,
    trendScore: Math.round(trendScore * 10) / 10,
    sentiment: analysis.sentiment,
    sentimentScore: Math.max(-1, Math.min(1, analysis.sentimentScore)),
    topHashtags,
    topics: unique([...(analysis.topics ?? []), ...deterministicTopics], 8),
    summary: analysis.summary?.trim() || undefined,
    latestPostAt,
    updatedAt: now.toISOString(),
    featuredPosts: sorted.slice(0, 3),
  };
}
