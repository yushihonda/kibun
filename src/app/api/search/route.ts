import { NextResponse, type NextRequest } from "next/server";
import { demoMovies } from "@/data/demo-movies";
import { filterDemoMovies, parseSearchFilters } from "@/lib/search/filters";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import {
  mapSearchMovie,
  type SearchMovieRow,
} from "@/lib/movies/map-search-row";
import { expandProviderSlugs } from "@/lib/providers/catalog";
import { buildSearchRails } from "@/lib/search/category-rails";
import {
  analyzeSearchQuery,
  rankSearchBatchesWithScores,
  type PlannedQuery,
  type SearchBatch,
} from "@/lib/search/query-intent";
import { createClient } from "@/lib/supabase/server";
import { withinRateLimit } from "@/lib/rate-limit";
import type { Movie } from "@/types/movie";

const fallbackQuery: PlannedQuery = {
  text: "",
  weight: 1,
  source: "fallback",
};

const SEARCH_RPC_CONCURRENCY = 2;

function withReasons(movies: Movie[], planExpanded: boolean) {
  return movies.map((movie) => ({
    ...movie,
    matchReasons: planExpanded ? (movie.matchReasons ?? []) : undefined,
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
  const providerIds = [
    ...new Set(
      batches.flatMap((batch) =>
        batch.movies.flatMap((movie) => movie.providers.map((item) => item.id)),
      ),
    ),
  ];
  const [{ data, error }, providerResult] = await Promise.all([
    supabase
      .from("movies")
      .select(
        "id,vote_count,sources,trending_at,theatrical_at,emotional_scores,aliases,keywords,origin_countries,tmdb_cast,tmdb_directors,tmdb_collection_id,providers_checked_at",
      )
      .in("id", ids),
    providerIds.length
      ? supabase
          .from("providers")
          .select("tmdb_provider_id,logo_path")
          .in("tmdb_provider_id", providerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) return batches;
  const logoByProviderId = new Map(
    (providerResult.data ?? []).map((provider) => [
      Number(provider.tmdb_provider_id),
      provider.logo_path as string | null,
    ]),
  );
  const metadataById = new Map(
    (data ?? []).map((row) => [row.id, row] as const),
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
            emotionScores:
              (metadata.emotional_scores as Record<string, number> | null) ??
              undefined,
            aliases: metadata.aliases ?? undefined,
            keywords: metadata.keywords ?? undefined,
            originCountries: metadata.origin_countries ?? undefined,
            cast: metadata.tmdb_cast as Movie["cast"],
            directors: metadata.tmdb_directors as Movie["directors"],
            collectionId: metadata.tmdb_collection_id ?? undefined,
            providersCheckedAt: metadata.providers_checked_at ?? undefined,
            providers: movie.providers.map((provider) => ({
              ...provider,
              logoPath: logoByProviderId.get(provider.id) ?? provider.logoPath,
            })),
          }
        : movie;
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
  const providerSlugs = expandProviderSlugs(effectiveProviders);
  const maxRuntime =
    filters.maxRuntime === null
      ? plan.inferredMaxRuntime
      : plan.inferredMaxRuntime === null
        ? filters.maxRuntime
        : Math.min(filters.maxRuntime, plan.inferredMaxRuntime);
  const minRating =
    Math.max(filters.minRating ?? 0, plan.inferredMinRating ?? 0) || null;
  const plannedQueries = plan.queries.length ? plan.queries : [fallbackQuery];
  const expandedSearch = plan.expanded && plannedQueries.length > 1;
  const candidateLimit = expandedSearch
    ? Math.min(100, Math.max(60, (filters.limit + filters.offset) * 2))
    : filters.limit;
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

  if (supabase) {
    const searchPromise = (async () => {
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
                p_offset: expandedSearch ? 0 : filters.offset,
              }),
            })),
        );
        responses.push(...batch);
      }
      return responses;
    })();
    const [responses, editorial] = await Promise.all([
      searchPromise,
      editorialPromise,
    ]);
    const batches: SearchBatch<Movie>[] = [];

    for (const {
      query,
      response: { data, error },
    } of responses) {
      if (error) {
        console.error("Supabase search RPC failed", {
          querySource: query.source,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        continue;
      }
      if (Array.isArray(data)) {
        batches.push({
          query,
          movies: (data as SearchMovieRow[]).map(mapSearchMovie),
        });
      }
    }

    if (batches.length) {
      const hydratedBatches = await hydrateSearchMetadata(supabase, batches);
      const ranked = expandedSearch
        ? rankSearchBatchesWithScores(hydratedBatches, plan).map(
            ({ movie, reasons }) => ({
              ...movie,
              matchReasons: reasons,
            }),
          )
        : hydratedBatches[0].movies;
      const page = expandedSearch
        ? ranked.slice(filters.offset, filters.offset + filters.limit)
        : ranked;
      const hits = attachEditorialComments(page, editorial);
      const rails = buildSearchRails(hits, plan, {
        editorialMovies: editorial,
        emptyQuery: !filters.query.trim(),
      });
      await recordSearchEvent(supabase, request, filters.query, hits.length);
      return NextResponse.json({
        hits: withReasons(hits, plan.expanded),
        movies: withReasons(hits, plan.expanded),
        rails,
        estimatedTotalHits: expandedSearch ? ranked.length : hits.length,
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
        ...filters,
        query: "",
        providers: effectiveProviders,
        maxRuntime,
        minRating,
        limit: 100,
        offset: 0,
      }
    : filters;
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
  const rails = buildSearchRails(hits, plan, {
    editorialMovies: editorial,
    emptyQuery: !filters.query.trim(),
  });
  await recordSearchEvent(supabase, request, filters.query, hits.length);
  return NextResponse.json({
    hits: withReasons(hits, plan.expanded),
    movies: withReasons(hits, plan.expanded),
    rails,
    estimatedTotalHits: rankedDemoHits.length,
    source: "demo",
    interpretation: plan.expanded ? { labels: plan.labels } : null,
  });
}
