import type { MovieSocialSignals, SocialPostPreview } from "@/types/movie";

export type MovieSocialSignalRow = {
  movie_id: string;
  post_count: number | string;
  total_views: number | string;
  total_likes: number | string;
  total_comments: number | string;
  total_shares: number | string;
  average_engagement_rate: number | string;
  trend_score: number | string;
  sentiment: MovieSocialSignals["sentiment"];
  sentiment_score: number | string;
  top_hashtags: string[] | null;
  topics: string[] | null;
  summary: string | null;
  latest_post_at: string | null;
  featured_posts: unknown;
  calculated_at: string;
};

function metric(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function postPreview(value: unknown): SocialPostPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const post = value as Record<string, unknown>;
  if (
    typeof post.videoId !== "string" ||
    typeof post.url !== "string" ||
    typeof post.caption !== "string"
  ) {
    return null;
  }
  try {
    const url = new URL(post.url);
    if (
      url.protocol !== "https:" ||
      !/(^|\.)tiktok\.com$/iu.test(url.hostname)
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return {
    videoId: post.videoId,
    url: post.url,
    caption: post.caption,
    authorUsername:
      typeof post.authorUsername === "string" ? post.authorUsername : undefined,
    postedAt: typeof post.postedAt === "string" ? post.postedAt : undefined,
    views: metric((post.views as number | string | undefined) ?? 0),
    likes: metric((post.likes as number | string | undefined) ?? 0),
    comments: metric((post.comments as number | string | undefined) ?? 0),
    shares: metric((post.shares as number | string | undefined) ?? 0),
    engagementRate: metric(
      (post.engagementRate as number | string | undefined) ?? 0,
    ),
    hashtags: Array.isArray(post.hashtags)
      ? post.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

export function mapMovieSocialSignals(
  row: MovieSocialSignalRow,
): MovieSocialSignals {
  return {
    postCount: metric(row.post_count),
    totalViews: metric(row.total_views),
    totalLikes: metric(row.total_likes),
    totalComments: metric(row.total_comments),
    totalShares: metric(row.total_shares),
    averageEngagementRate: metric(row.average_engagement_rate),
    trendScore: metric(row.trend_score),
    sentiment: row.sentiment,
    sentimentScore: metric(row.sentiment_score),
    topHashtags: row.top_hashtags ?? [],
    topics: row.topics ?? [],
    summary: row.summary ?? undefined,
    latestPostAt: row.latest_post_at ?? undefined,
    updatedAt: row.calculated_at,
    featuredPosts: mapFeaturedPosts(row.featured_posts),
  };
}

export function mapFeaturedPosts(value: unknown): SocialPostPreview[] {
  return Array.isArray(value)
    ? value.flatMap((post) => {
        const mapped = postPreview(post);
        return mapped ? [mapped] : [];
      })
    : [];
}
