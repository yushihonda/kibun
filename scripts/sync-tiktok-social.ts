import "./load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateTikTokSignals,
  calculateEngagementRate,
  classifySocialTopics,
  type TikTokSignalPost,
} from "../src/lib/social/tiktok-signals.js";
import type { SocialPostPreview } from "../src/types/movie.js";
import { analyzeTikTokPosts } from "./social/analyze-tiktok-posts.js";
import {
  prioritizeLeastRecentlyRefreshed,
  selectBalancedMediaCandidates,
} from "./social/tiktok-candidates.js";
import {
  TikTokRapidApiClient,
  type TikTokSearchPost,
} from "./social/tiktok-client.js";
import {
  matchesTikTokTargetRegion,
  scoreTikTokTitleRelevance,
  titleHashtags,
} from "./social/tiktok-relevance.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isInteger(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const details = ["message", "details", "hint", "code"]
      .flatMap((key) => {
        const field = value[key];
        return typeof field === "string" && field.trim()
          ? [`${key}=${field.trim()}`]
          : [];
      })
      .join("; ");
    if (details) return details;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown structured error";
    }
  }
  return String(error);
}

type MovieRow = {
  id: string;
  title: string;
  original_title: string | null;
  aliases: string[] | null;
  media_type: "movie" | "tv";
  release_date: string | null;
  trending_at: string | null;
  theatrical_at: string | null;
  popularity: number | string;
};

type SocialPostRow = {
  video_id: string;
  url: string;
  caption: string;
  author_username: string | null;
  posted_at: string | null;
  view_count: number | string;
  like_count: number | string;
  comment_count: number | string;
  share_count: number | string;
  engagement_rate: number | string;
  hashtags: string[] | null;
};

type SocialSignalRefreshRow = {
  movie_id: string;
  calculated_at: string;
};

const movieFields =
  "id,title,original_title,aliases,media_type,release_date,trending_at,theatrical_at,popularity";

function targetMediaTypes(): Array<"movie" | "tv"> {
  const requested = (process.env.TIKTOK_SYNC_MEDIA_TYPES ?? "movie,tv")
    .split(",")
    .map((value) => value.trim())
    .filter(
      (value): value is "movie" | "tv" => value === "movie" || value === "tv",
    );
  return requested.length ? [...new Set(requested)] : ["movie", "tv"];
}

function aliasesFor(movie: MovieRow): string[] {
  return [movie.original_title, ...(movie.aliases ?? [])]
    .map((value) => value?.trim())
    .filter(
      (value, index, values): value is string =>
        Boolean(value) &&
        value !== movie.title &&
        values.indexOf(value) === index,
    );
}

function candidateScore(movie: MovieRow): number {
  const now = Date.now();
  const freshness = [movie.trending_at, movie.theatrical_at, movie.release_date]
    .map((value) => (value ? Date.parse(value) : 0))
    .reduce((max, value) => Math.max(max, value), 0);
  const ageDays = freshness ? Math.max(0, now - freshness) / 86_400_000 : 60;
  return (
    Math.max(0, 60 - ageDays) + Math.log10(Number(movie.popularity) + 1) * 10
  );
}

async function loadCandidates(
  supabase: SupabaseClient,
  limit: number,
): Promise<MovieRow[]> {
  const mediaTypes = targetMediaTypes();
  const selectedIds = (process.env.TIKTOK_SYNC_MOVIE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (selectedIds.length) {
    const { data, error } = await supabase
      .from("movies")
      .select(movieFields)
      .in("id", selectedIds)
      .in("media_type", mediaTypes)
      .eq("adult", false);
    if (error) throw error;
    return (data ?? []) as unknown as MovieRow[];
  }

  const batchLimit = Math.min(100, Math.max(limit * 2, 20));
  // New releases, such as a fresh season TMDB lists as its own show, are
  // often discussed on TikTok before they show up in TMDB's trending lists.
  const today = new Date().toISOString().slice(0, 10);
  const recentSince = new Date(Date.now() - 45 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [trending, theatrical, popular, recent] = await Promise.all([
    supabase
      .from("movies")
      .select(movieFields)
      .in("media_type", mediaTypes)
      .eq("adult", false)
      .not("trending_at", "is", null)
      .order("trending_at", { ascending: false })
      .limit(batchLimit),
    supabase
      .from("movies")
      .select(movieFields)
      .in("media_type", mediaTypes)
      .eq("adult", false)
      .not("theatrical_at", "is", null)
      .order("theatrical_at", { ascending: false })
      .limit(batchLimit),
    supabase
      .from("movies")
      .select(movieFields)
      .in("media_type", mediaTypes)
      .eq("adult", false)
      .order("popularity", { ascending: false })
      .limit(batchLimit),
    supabase
      .from("movies")
      .select(movieFields)
      .in("media_type", mediaTypes)
      .eq("adult", false)
      .gte("release_date", recentSince)
      .lte("release_date", today)
      .order("popularity", { ascending: false })
      .limit(batchLimit),
  ]);
  for (const result of [trending, theatrical, popular, recent]) {
    if (result.error) throw result.error;
  }
  const candidates = [
    ...new Map(
      [trending.data, theatrical.data, popular.data, recent.data]
        .flat()
        .filter((movie): movie is NonNullable<typeof movie> => Boolean(movie))
        .map((movie) => [movie.id, movie as unknown as MovieRow] as const),
    ).values(),
  ]
    .sort(
      (a, b) =>
        candidateScore(b) - candidateScore(a) || a.id.localeCompare(b.id),
    )
    .slice(0, limit);
  if (!candidates.length) return [];
  const { data: refreshRows, error: refreshError } = await supabase
    .from("movie_social_signals")
    .select("movie_id,calculated_at")
    .in(
      "movie_id",
      candidates.map((movie) => movie.id),
    );
  if (refreshError) throw refreshError;
  const refreshedAt = new Map(
    ((refreshRows ?? []) as SocialSignalRefreshRow[]).map((row) => [
      row.movie_id,
      Date.parse(row.calculated_at) || 0,
    ]),
  );
  return prioritizeLeastRecentlyRefreshed(
    candidates,
    refreshedAt,
    candidateScore,
  );
}

function previewFromRow(row: SocialPostRow): TikTokSignalPost {
  return {
    videoId: row.video_id,
    url: row.url,
    caption: row.caption,
    authorUsername: row.author_username ?? undefined,
    postedAt: row.posted_at ?? undefined,
    views: Number(row.view_count),
    likes: Number(row.like_count),
    comments: Number(row.comment_count),
    shares: Number(row.share_count),
    engagementRate: Number(row.engagement_rate),
    hashtags: row.hashtags ?? [],
  };
}

async function savePosts(
  supabase: SupabaseClient,
  movie: MovieRow,
  posts: Array<TikTokSearchPost & { relevanceScore: number }>,
) {
  if (!posts.length) return;
  const fetchedAt = new Date().toISOString();
  const { error } = await supabase.from("movie_social_posts").upsert(
    posts.map((post) => {
      const engagementRate = calculateEngagementRate(post);
      return {
        movie_id: movie.id,
        platform: "tiktok",
        video_id: post.videoId,
        url: post.url,
        caption: post.caption.slice(0, 4_000),
        author_username: post.authorUsername?.slice(0, 100) ?? null,
        region_code: /^[A-Z]{2}$/u.test(post.regionCode ?? "")
          ? post.regionCode
          : null,
        posted_at: post.postedAt ?? null,
        duration_seconds: post.durationSeconds ?? null,
        view_count: post.views,
        like_count: post.likes,
        comment_count: post.comments,
        share_count: post.shares,
        engagement_rate: engagementRate,
        hashtags: post.hashtags.slice(0, 30),
        topics: classifySocialTopics(post.caption, post.hashtags),
        relevance_score: post.relevanceScore,
        source: "rapidapi",
        status: "approved",
        fetched_at: fetchedAt,
      };
    }),
    { onConflict: "movie_id,video_id" },
  );
  if (error) throw error;
}

async function loadSavedPosts(
  supabase: SupabaseClient,
  movieId: string,
): Promise<SocialPostRow[]> {
  const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("movie_social_posts")
    .select(
      "video_id,url,caption,author_username,posted_at,view_count,like_count,comment_count,share_count,engagement_rate,hashtags",
    )
    .eq("movie_id", movieId)
    .eq("status", "approved")
    .or(`posted_at.is.null,posted_at.gte.${cutoff}`)
    .order("view_count", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as SocialPostRow[];
}

async function main() {
  const apiKey = required("RAPIDAPI_TIKTOK_KEY");
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const titleLimit = integerEnv("TIKTOK_SYNC_TITLE_LIMIT", 1, 1, 100);
  const candidatePoolLimit = integerEnv(
    "TIKTOK_SYNC_CANDIDATE_POOL_LIMIT",
    20,
    titleLimit,
    100,
  );
  const postsPerTitle = integerEnv("TIKTOK_SYNC_POSTS_PER_TITLE", 30, 1, 50);
  const maxPagesPerTitle = integerEnv(
    "TIKTOK_SYNC_MAX_PAGES_PER_TITLE",
    6,
    1,
    6,
  );
  const minimumViews = integerEnv("TIKTOK_SYNC_MIN_VIEWS", 500, 0, 10_000_000);
  const aiLimit = integerEnv("TIKTOK_AI_MAX_TITLES", 10, 0, 100);
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  const openAiModel = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
  const keywordOverride = process.env.TIKTOK_SYNC_KEYWORD_OVERRIDE?.trim();
  const client = new TikTokRapidApiClient({
    apiKey,
    provider: (() => {
      const provider = process.env.TIKTOK_RAPIDAPI_PROVIDER?.trim();
      if (provider === "all-in-one" || provider === "tiktok-api23") {
        return provider;
      }
      return "tokapi-mobile";
    })(),
    host: process.env.TIKTOK_RAPIDAPI_HOST?.trim() || undefined,
    endpoint: process.env.TIKTOK_RAPIDAPI_ENDPOINT?.trim() || undefined,
  });
  const { data: run, error: runError } = await supabase
    .from("sync_runs")
    .insert({ source: "tiktok_social", status: "running" })
    .select("id")
    .single();
  if (runError) throw runError;

  let processed = 0;
  let imported = 0;
  let aiAnalyzed = 0;
  const errors: Array<{ movieId: string; message: string }> = [];
  try {
    const candidatePool = await loadCandidates(supabase, candidatePoolLimit);
    const movies = selectBalancedMediaCandidates(candidatePool, titleLimit);
    for (const movie of movies) {
      try {
        const aliases = aliasesFor(movie);
        const searchKeyword = keywordOverride || movie.title;
        const results = await client.search(searchKeyword, {
          region: "JP",
          count: postsPerTitle,
          maxPages: maxPagesPerTitle,
        });
        const regionalResults = results.filter((post) =>
          matchesTikTokTargetRegion(post, "JP"),
        );
        const relevant = regionalResults
          .map((post) => ({
            ...post,
            relevanceScore: scoreTikTokTitleRelevance(
              post,
              movie.title,
              aliases,
            ),
          }))
          .filter(
            (post) => post.relevanceScore >= 0.7 && post.views >= minimumViews,
          );
        console.log(
          JSON.stringify({
            stage: "search",
            movieId: movie.id,
            title: movie.title,
            searchKeyword,
            returnedPosts: results.length,
            regionalPosts: regionalResults.length,
            relevantPosts: relevant.length,
          }),
        );
        await savePosts(supabase, movie, relevant);
        const savedRows = await loadSavedPosts(supabase, movie.id);
        let analysis;
        if (openAiApiKey && relevant.length > 0 && aiAnalyzed < aiLimit) {
          try {
            analysis = await analyzeTikTokPosts({
              apiKey: openAiApiKey,
              model: openAiModel,
              title: movie.title,
              mediaType: movie.media_type,
              posts: relevant,
            });
            aiAnalyzed += 1;
          } catch (error) {
            console.warn("TikTok sentiment analysis failed", {
              movieId: movie.id,
              message: errorMessage(error),
            });
          }
        }
        const signals = aggregateTikTokSignals(savedRows.map(previewFromRow), {
          analysis,
          excludedHashtags: titleHashtags(movie.title, aliases),
        });
        const { error: signalError } = await supabase
          .from("movie_social_signals")
          .upsert(
            {
              movie_id: movie.id,
              source: "rapidapi",
              post_count: signals.postCount,
              total_views: signals.totalViews,
              total_likes: signals.totalLikes,
              total_comments: signals.totalComments,
              total_shares: signals.totalShares,
              average_engagement_rate: signals.averageEngagementRate,
              trend_score: signals.trendScore,
              sentiment: signals.sentiment,
              sentiment_score: signals.sentimentScore,
              top_hashtags: signals.topHashtags,
              topics: signals.topics,
              summary: signals.summary ?? null,
              latest_post_at: signals.latestPostAt ?? null,
              featured_posts:
                signals.featuredPosts satisfies SocialPostPreview[],
              calculated_at: signals.updatedAt,
            },
            { onConflict: "movie_id" },
          );
        if (signalError) throw signalError;
        processed += 1;
        imported += relevant.length;
        console.log(
          JSON.stringify({
            movieId: movie.id,
            title: movie.title,
            matchedPosts: relevant.length,
            trendScore: signals.trendScore,
          }),
        );
      } catch (error) {
        errors.push({
          movieId: movie.id,
          message: errorMessage(error),
        });
      }
    }
    if (!processed && errors.length) {
      throw new Error(`All TikTok title syncs failed: ${errors[0]?.message}`);
    }
    await supabase
      .from("sync_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        records_processed: imported,
        metadata: {
          titlesProcessed: processed,
          titlesFailed: errors.length,
          aiAnalyzed,
          errors: errors.slice(0, 20),
        },
      })
      .eq("id", run.id);
    console.log(
      JSON.stringify(
        { processed, imported, aiAnalyzed, failed: errors.length },
        null,
        2,
      ),
    );
  } catch (error) {
    await supabase
      .from("sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        records_processed: imported,
        error_message: errorMessage(error).slice(0, 2_000),
        metadata: { titlesProcessed: processed, errors: errors.slice(0, 20) },
      })
      .eq("id", run.id);
    throw error;
  }
}

void main();
