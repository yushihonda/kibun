import { after, NextResponse, type NextRequest } from "next/server";
import { demoMovies } from "@/data/demo-movies";
import {
  filterDemoMovies,
  parseSearchFilters,
  type SearchFilters,
} from "@/lib/search/filters";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import {
  mapSearchMovie,
  type SearchMovieRow,
} from "@/lib/movies/map-search-row";
import {
  expandProviderSlugs,
  normalizeProviders,
} from "@/lib/providers/catalog";
import {
  analyzeSearchQuery,
  rankSearchBatchesWithScores,
  type PlannedQuery,
  type SearchBatch,
  type SearchPlan,
} from "@/lib/search/query-intent";
import { loadSearchPersonalization } from "@/lib/search/personalization";
import { createClient } from "@/lib/supabase/server";
import { withinRateLimit } from "@/lib/rate-limit";
import {
  mapMovieSocialSignals,
  type MovieSocialSignalRow,
} from "@/lib/social/map-signals";
import type { Movie, MovieVideo, OfferType, Provider } from "@/types/movie";

const fallbackQuery: PlannedQuery = {
  text: "",
  weight: 1,
  source: "fallback",
};

const SEARCH_RPC_CONCURRENCY = 3;
const SEARCH_RPC_MAX_QUERIES = 3;
const SEARCH_HYDRATION_BUFFER = 72;
const SEARCH_HYDRATION_MINIMUM = 120;
const socialIntentPattern = /tiktok|ティックトック|話題|バズ|口コミ/iu;
const FAST_SEARCH_FIELDS =
  "id,tmdb_id,media_type,title,original_title,overview,poster_path,backdrop_path,release_date,runtime,vote_average,popularity,genres,emotional_tags";

type ProviderHydrationRow = {
  movie_id: string;
  offer_type: OfferType;
  tmdb_link: string | null;
  updated_at: string;
  providers:
    | {
        tmdb_provider_id: number;
        name: string;
        slug: string;
        logo_path: string | null;
      }
    | Array<{
        tmdb_provider_id: number;
        name: string;
        slug: string;
        logo_path: string | null;
      }>
    | null;
};

type VideoHydrationRow = {
  movie_id: string;
  platform: "youtube" | "tiktok";
  video_id: string;
  url: string | null;
};

function withReasons(movies: Movie[], planExpanded: boolean) {
  return movies.map((movie) => ({
    ...movie,
    matchReasons:
      planExpanded || (movie.matchReasons?.length ?? 0) > 0
        ? (movie.matchReasons ?? [])
        : undefined,
  }));
}

function attachEditorialComments(hits: Movie[], editorial: Movie[]): Movie[] {
  if (!editorial.length) return hits;
  const byId = new Map(
    editorial.map((movie) => [movie.id, movie.editorialComment]),
  );
  return hits.map((movie) =>
    byId.has(movie.id)
      ? { ...movie, editorialComment: byId.get(movie.id) }
      : movie,
  );
}

async function loadFastIntentBatches(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  plan: SearchPlan,
  filters: SearchFilters,
  maxRuntime: number | null,
  minRating: number | null,
  candidateLimit: number,
): Promise<SearchBatch<Movie>[]> {
  const emotionalTags = [
    ...new Set([...plan.preferredEmotionalTags, ...filters.tags]),
  ].slice(0, 8);
  const genres = [
    ...new Set([...Object.keys(plan.preferredGenres), ...filters.tags]),
  ].slice(0, 8);
  const matchers: Array<{
    column: "emotional_tags" | "genres" | null;
    values: string[];
    orderBy?: "popularity" | "vote_average";
  }> = [];
  if (emotionalTags.length) {
    matchers.push({ column: "emotional_tags", values: emotionalTags });
    if (plan.inferredOriginCountries.length) {
      matchers.push({
        column: "emotional_tags",
        values: emotionalTags,
        orderBy: "vote_average",
      });
    }
  }
  if (genres.length) matchers.push({ column: "genres", values: genres });
  if (!matchers.length) matchers.push({ column: null, values: [] });

  const results = await Promise.all(
    matchers.map(async ({ column, values, orderBy = "popularity" }) => {
      let query = supabase
        .from("movies")
        .select(FAST_SEARCH_FIELDS)
        .eq("adult", false)
        .order(orderBy, { ascending: false, nullsFirst: false })
        .limit(candidateLimit);
      if (orderBy !== "popularity") {
        query = query.order("popularity", {
          ascending: false,
          nullsFirst: false,
        });
      }
      if (column) query = query.overlaps(column, values);
      if (filters.mediaTypes.length) {
        query = query.in("media_type", filters.mediaTypes);
      }
      if (plan.inferredOriginCountries.length) {
        query = query.overlaps(
          "origin_countries",
          plan.inferredOriginCountries,
        );
      }
      if (maxRuntime !== null) query = query.lte("runtime", maxRuntime);
      if (minRating !== null) {
        query = query.gte("vote_average", minRating);
      }
      if (plan.inferredMinVoteCount !== null) {
        query = query.gte("vote_count", plan.inferredMinVoteCount);
      }
      return query;
    }),
  );

  return results.flatMap(({ data, error }, index) => {
    if (error || !data?.length) return [];
    return [
      {
        query: {
          text: "",
          weight: index === 0 ? 3 : 2.5,
          source: "intent",
        },
        movies: (data as unknown as SearchMovieRow[]).map(mapSearchMovie),
      } satisfies SearchBatch<Movie>,
    ];
  });
}

async function loadRpcSearchBatches(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  plannedQueries: PlannedQuery[],
  plan: SearchPlan,
  filters: SearchFilters,
  providerSlugs: string[],
  maxRuntime: number | null,
  minRating: number | null,
  candidateLimit: number,
): Promise<SearchBatch<Movie>[]> {
  const responses = [];
  for (
    let start = 0;
    start < plannedQueries.length;
    start += SEARCH_RPC_CONCURRENCY
  ) {
    const batch = await Promise.all(
      plannedQueries
        .slice(start, start + SEARCH_RPC_CONCURRENCY)
        .map(async (query) => ({
          query,
          response: await supabase.rpc("search_movies", {
            p_query: query.text,
            p_origin_countries: plan.inferredOriginCountries.length
              ? plan.inferredOriginCountries
              : null,
            p_provider_slugs: providerSlugs.length ? providerSlugs : null,
            p_offer_types: filters.offerTypes.length
              ? filters.offerTypes
              : null,
            p_max_runtime: maxRuntime,
            p_min_rating: minRating,
            p_min_vote_count: plan.inferredMinVoteCount,
            p_tags: filters.tags.length ? filters.tags : null,
            p_exclude_watched: filters.excludeWatched,
            p_media_types: filters.mediaTypes.length
              ? filters.mediaTypes
              : null,
            p_limit: candidateLimit,
            p_offset: 0,
          }),
        })),
    );
    responses.push(...batch);
  }

  return responses.flatMap(({ query, response: { data, error } }) => {
    if (error) {
      console.error("Supabase search RPC failed", {
        querySource: query.source,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return [];
    }
    if (!Array.isArray(data)) return [];
    return [
      {
        query,
        movies: (data as SearchMovieRow[]).map(mapSearchMovie),
      } satisfies SearchBatch<Movie>,
    ];
  });
}

async function hydrateSearchMetadata(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  batches: SearchBatch<Movie>[],
): Promise<SearchBatch<Movie>[]> {
  const ids = [
    ...new Set(
      batches.flatMap((batch) => batch.movies.map((movie) => movie.id)),
    ),
  ];
  if (!ids.length) return batches;
  const [{ data, error }, providerResult, videoResult, socialResult] =
    await Promise.all([
      supabase
        .from("movies")
        .select(
          "id,vote_count,sources,trending_at,theatrical_at,last_synced_at,emotional_scores,providers_checked_at",
        )
        .in("id", ids),
      supabase
        .from("movie_providers")
        .select(
          "movie_id,offer_type,tmdb_link,updated_at,providers(tmdb_provider_id,name,slug,logo_path)",
        )
        .in("movie_id", ids)
        .eq("country", "JP"),
      supabase
        .from("movie_videos")
        .select("movie_id,platform,video_id,url")
        .in("movie_id", ids)
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
      supabase
        .from("movie_social_signals")
        .select(
          "movie_id,post_count,total_views,total_likes,total_comments,total_shares,average_engagement_rate,trend_score,sentiment,sentiment_score,top_hashtags,topics,summary,latest_post_at,featured_posts,calculated_at",
        )
        .in("movie_id", ids),
    ]);
  if (error) return batches;
  const providersByMovie = new Map<string, Provider[]>();
  for (const row of (providerResult.data ?? []) as ProviderHydrationRow[]) {
    const provider = Array.isArray(row.providers)
      ? row.providers[0]
      : row.providers;
    if (!provider) continue;
    const providers = providersByMovie.get(row.movie_id) ?? [];
    providers.push({
      id: Number(provider.tmdb_provider_id),
      name: provider.name,
      slug: provider.slug,
      type: row.offer_type,
      logoPath: provider.logo_path ?? undefined,
      tmdbLink: row.tmdb_link ?? undefined,
      checkedAt: row.updated_at,
    });
    providersByMovie.set(row.movie_id, providers);
  }
  const videosByMovie = new Map<string, MovieVideo>();
  for (const row of (videoResult.data ?? []) as VideoHydrationRow[]) {
    const current = videosByMovie.get(row.movie_id);
    if (current?.platform === "youtube") continue;
    if (!current || row.platform === "youtube") {
      videosByMovie.set(row.movie_id, {
        platform: row.platform,
        videoId: row.video_id,
        url: row.url ?? undefined,
      });
    }
  }
  const metadataById = new Map(
    (data ?? []).map((row) => [row.id, row] as const),
  );
  const socialById = new Map(
    ((socialResult.data ?? []) as unknown as MovieSocialSignalRow[]).map(
      (row) => [row.movie_id, mapMovieSocialSignals(row)],
    ),
  );
  return batches.map((batch) => ({
    ...batch,
    movies: batch.movies.map((movie) => {
      const metadata = metadataById.get(movie.id);
      return metadata
        ? {
            ...movie,
            voteCount: Number(metadata.vote_count ?? 0),
            sources: metadata.sources ?? undefined,
            trendingAt: metadata.trending_at ?? undefined,
            theatricalAt: metadata.theatrical_at ?? undefined,
            lastSyncedAt: metadata.last_synced_at ?? undefined,
            emotionScores:
              (metadata.emotional_scores as Record<string, number> | null) ??
              undefined,
            providersCheckedAt: metadata.providers_checked_at ?? undefined,
            providers: normalizeProviders(
              providersByMovie.get(movie.id) ?? movie.providers,
            ),
            video: videosByMovie.get(movie.id) ?? movie.video,
            socialSignals: socialById.get(movie.id),
          }
        : { ...movie, socialSignals: socialById.get(movie.id) };
    }),
  }));
}

async function recordSearchEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: NextRequest,
  query: string,
  resultCount: number,
) {
  if (!supabase) return;
  const sessionId = request.headers.get("x-kibun-session");
  const validSession =
    sessionId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      sessionId,
    )
      ? sessionId
      : null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !validSession) return;
  const writes = [
    supabase.from("product_events").insert({
      user_id: user?.id ?? null,
      session_id: validSession,
      event_name: resultCount === 0 ? "zero_results" : "search",
      query: query || null,
      metadata: { resultCount },
    }),
  ];
  if (user) {
    writes.push(
      supabase.from("search_events").insert({
        user_id: user.id,
        query,
        result_count: resultCount,
      }),
    );
  }
  const results = await Promise.all(writes);
  if (results.some((result) => result.error)) {
    console.error("Search analytics write failed");
  }
}

export async function GET(request: NextRequest) {
  const filters = parseSearchFilters(request.nextUrl.searchParams);
  const plan = analyzeSearchQuery(filters.query);
  const effectiveProviders = filters.providers.length
    ? filters.providers
    : plan.inferredProviderSlugs;
  const effectiveFilters = {
    ...filters,
    mediaTypes: filters.mediaTypes.length
      ? filters.mediaTypes
      : plan.inferredMediaTypes,
  };
  const providerSlugs = expandProviderSlugs(effectiveProviders);
  const maxRuntime =
    filters.maxRuntime === null
      ? plan.inferredMaxRuntime
      : plan.inferredMaxRuntime === null
        ? filters.maxRuntime
        : Math.min(filters.maxRuntime, plan.inferredMaxRuntime);
  const minRating =
    Math.max(filters.minRating ?? 0, plan.inferredMinRating ?? 0) || null;
  const plannedQueries = (
    plan.queries.length ? plan.queries : [fallbackQuery]
  ).slice(0, SEARCH_RPC_MAX_QUERIES);
  const candidateLimit = Math.min(
    100,
    Math.max(60, filters.limit + filters.offset + 12),
  );
  const supabase = await createClient();
  if (
    supabase &&
    !(await withinRateLimit(request, supabase, {
      namespace: "search",
      maxRequests: 60,
      windowSeconds: 60,
    }))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const editorialPromise = supabase
    ? loadEditorialMovies(supabase).catch(() => [] as Movie[])
    : Promise.resolve(
        demoMovies.filter((movie) => movie.editorialComment) as Movie[],
      );
  const personalizationPromise = supabase
    ? loadSearchPersonalization(supabase).catch(() => null)
    : Promise.resolve(null);

  if (supabase) {
    const canUseFastIntentSearch =
      plan.expanded &&
      !socialIntentPattern.test(filters.query) &&
      !filters.excludeWatched &&
      providerSlugs.length === 0 &&
      filters.offerTypes.length === 0;
    const searchPromise = canUseFastIntentSearch
      ? Promise.all([
          loadFastIntentBatches(
            supabase,
            plan,
            effectiveFilters,
            maxRuntime,
            minRating,
            candidateLimit,
          ),
          loadRpcSearchBatches(
            supabase,
            plannedQueries.filter(({ source }) => source === "literal"),
            plan,
            effectiveFilters,
            providerSlugs,
            maxRuntime,
            minRating,
            candidateLimit,
          ),
        ]).then(([intentBatches, literalBatches]) => [
          ...intentBatches,
          ...literalBatches,
        ])
      : loadRpcSearchBatches(
          supabase,
          plannedQueries,
          plan,
          effectiveFilters,
          providerSlugs,
          maxRuntime,
          minRating,
          candidateLimit,
        );
    const [batches, editorial, personalization] = await Promise.all([
      searchPromise,
      editorialPromise,
      personalizationPromise,
    ]);

    if (batches.length) {
      const preliminaryRanking = rankSearchBatchesWithScores(
        batches,
        plan,
        personalization,
      );
      const hydrationLimit = Math.max(
        SEARCH_HYDRATION_MINIMUM,
        filters.offset + filters.limit + SEARCH_HYDRATION_BUFFER,
      );
      const hydrateAllCandidates = socialIntentPattern.test(filters.query);
      const hydratedIds = hydrateAllCandidates
        ? null
        : new Set(
            preliminaryRanking
              .slice(0, hydrationLimit)
              .map(({ movie }) => movie.id),
          );
      const hydrationBatches = hydratedIds
        ? batches.map((batch) => ({
            ...batch,
            movies: batch.movies.filter((movie) => hydratedIds.has(movie.id)),
          }))
        : batches;
      const hydratedBatches = await hydrateSearchMetadata(
        supabase,
        hydrationBatches,
      );
      const ranked = rankSearchBatchesWithScores(
        hydratedBatches,
        plan,
        personalization,
      ).map(({ movie, reasons }) => ({
        ...movie,
        matchReasons: reasons,
      }));
      const page = ranked.slice(filters.offset, filters.offset + filters.limit);
      const hits = attachEditorialComments(page, editorial);
      after(() =>
        recordSearchEvent(supabase, request, filters.query, hits.length),
      );
      return NextResponse.json({
        hits: withReasons(hits, plan.expanded),
        estimatedTotalHits: preliminaryRanking.length,
        source: "supabase",
        interpretation: plan.expanded
          ? {
              labels: plan.labels,
              inferredMaxRuntime: plan.inferredMaxRuntime,
              inferredMinRating: plan.inferredMinRating,
              inferredProviders: plan.inferredProviderSlugs,
            }
          : null,
      });
    }
  }

  const editorial = await editorialPromise;
  const demoFilters = plan.expanded
    ? {
        ...effectiveFilters,
        query: "",
        providers: effectiveProviders,
        maxRuntime,
        minRating,
        limit: 100,
        offset: 0,
      }
    : effectiveFilters;
  const demoHits = filterDemoMovies(demoMovies, demoFilters);
  const rankedDemoHits = plan.expanded
    ? rankSearchBatchesWithScores(
        [{ query: fallbackQuery, movies: demoHits }],
        plan,
      ).map(({ movie, reasons }) => ({ ...movie, matchReasons: reasons }))
    : demoHits;
  const page = plan.expanded
    ? rankedDemoHits.slice(filters.offset, filters.offset + filters.limit)
    : rankedDemoHits;
  const hits = attachEditorialComments(page, editorial);
  after(() => recordSearchEvent(supabase, request, filters.query, hits.length));
  return NextResponse.json({
    hits: withReasons(hits, plan.expanded),
    estimatedTotalHits: rankedDemoHits.length,
    source: "demo",
    interpretation: plan.expanded ? { labels: plan.labels } : null,
  });
}
