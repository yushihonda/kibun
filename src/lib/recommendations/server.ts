import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { readEdgeJson, writeEdgeJson } from "@/lib/cache/edge-json";
import { loadCatalogMovies, type CatalogMovie } from "@/lib/movies/catalog";
import {
  buildPreferenceProfile,
  recommendMovies,
  type RecommendationInteraction,
} from "@/lib/recommendations/engine";
import { analyzeSearchQuery } from "@/lib/search/query-intent";

type InteractionRow = {
  movie_id: string;
  status: "WATCHED" | "WATCHLIST" | "NONE";
  is_favorite: boolean;
  rating: number | null;
};

type EventRow = {
  event_name: "search" | "detail_view" | "movie_click";
  movie_id: string | null;
  query: string | null;
};

async function loadCandidatePool(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ movies: CatalogMovie[]; complete: boolean }> {
  const trendingSince = new Date(now.getTime() - 10 * 86_400_000).toISOString();
  const { data: socialRows } = await supabase
    .from("movie_social_signals")
    .select("movie_id")
    .gte(
      "calculated_at",
      new Date(now.getTime() - 30 * 86_400_000).toISOString(),
    )
    .order("trend_score", { ascending: false })
    .limit(80);
  const socialMovieIds = (socialRows ?? []).map((row) => String(row.movie_id));
  // Each group is a large query that can hit the statement timeout under
  // load; the others still make a usable pool.
  const groups = await Promise.allSettled([
    loadCatalogMovies(supabase, {
      limit: 240,
      orderBy: "popularity",
      includeRecommendationMetadata: true,
    }),
    loadCatalogMovies(supabase, {
      limit: 200,
      orderBy: "vote_count",
      includeRecommendationMetadata: true,
    }),
    loadCatalogMovies(supabase, {
      limit: 120,
      orderBy: "trending_at",
      trendingSince,
      includeRecommendationMetadata: true,
    }),
    socialMovieIds.length
      ? loadCatalogMovies(supabase, {
          limit: socialMovieIds.length,
          movieIds: socialMovieIds,
          includeRecommendationMetadata: true,
        })
      : Promise.resolve([]),
  ]);
  const loaded = groups.flatMap((group) =>
    group.status === "fulfilled" ? [group.value] : [],
  );
  if (!loaded.length) {
    throw (groups[0] as PromiseRejectedResult).reason;
  }
  return {
    movies: [
      ...new Map(
        loaded.flat().map((movie) => [movie.id, movie] as const),
      ).values(),
    ],
    complete: loaded.length === groups.length,
  };
}

// The pool is the same for every viewer and costs several large catalog
// queries, so it is shared; personal signals are still applied per request.
// The catalog itself only changes with the daily sync.
const CANDIDATE_POOL_CACHE_KEY = "recommendation-candidates-v1";
const CANDIDATE_POOL_TTL_SECONDS = 30 * 60;
// A pool missing a timed-out group is retried soon instead of kept for long.
const PARTIAL_POOL_TTL_SECONDS = 60;

let cachedPool: { value: CatalogMovie[]; expiresAt: number } | null = null;
let pendingPool: Promise<CatalogMovie[]> | null = null;

function loadSharedCandidatePool(supabase: SupabaseClient, now: Date) {
  if (cachedPool && cachedPool.expiresAt > Date.now()) {
    return Promise.resolve(cachedPool.value);
  }
  if (pendingPool) return pendingPool;
  pendingPool = readEdgeJson<CatalogMovie[]>(CANDIDATE_POOL_CACHE_KEY)
    .then(async (edgeValue) => {
      if (edgeValue?.length) {
        return { movies: edgeValue, ttl: CANDIDATE_POOL_TTL_SECONDS };
      }
      const { movies, complete } = await loadCandidatePool(supabase, now);
      if (complete) {
        await writeEdgeJson(
          CANDIDATE_POOL_CACHE_KEY,
          movies,
          CANDIDATE_POOL_TTL_SECONDS,
        );
      }
      return {
        movies,
        ttl: complete ? CANDIDATE_POOL_TTL_SECONDS : PARTIAL_POOL_TTL_SECONDS,
      };
    })
    .then(({ movies, ttl }) => {
      cachedPool = { value: movies, expiresAt: Date.now() + ttl * 1_000 };
      return movies;
    })
    .finally(() => {
      pendingPool = null;
    });
  return pendingPool;
}

export async function loadRecommendations(
  supabase: SupabaseClient,
  options?: {
    seedMovieId?: string;
    limit?: number;
    now?: Date;
    user?: User | null;
  },
) {
  const now = options?.now ?? new Date();
  const user =
    options && "user" in options
      ? (options.user ?? null)
      : (await supabase.auth.getUser()).data.user;
  const [
    { data: preferenceRow },
    { data: interactionRows },
    { data: eventData },
    candidates,
  ] = await Promise.all([
    user
      ? supabase
          .from("user_preferences")
          .select(
            "personalization_enabled,preferred_genres,preferred_emotions,onboarding_completed",
          )
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("user_movie_interactions")
          .select("movie_id,status,is_favorite,rating")
          .eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
    user
      ? supabase
          .from("product_events")
          .select("event_name,movie_id,query")
          .eq("user_id", user.id)
          .in("event_name", ["search", "detail_view", "movie_click"])
          .order("created_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] }),
    loadSharedCandidatePool(supabase, now),
  ]);

  const rows = (interactionRows ?? []) as InteractionRow[];
  const eventRows = (eventData ?? []) as EventRow[];
  const signalIds = [
    ...new Set([
      ...rows.map((row) => row.movie_id),
      ...eventRows.flatMap((row) => (row.movie_id ? [row.movie_id] : [])),
      ...(options?.seedMovieId ? [options.seedMovieId] : []),
    ]),
  ];
  const candidateById = new Map(candidates.map((movie) => [movie.id, movie]));
  const missingSignalIds = signalIds.filter((id) => !candidateById.has(id));
  const signalMovies = missingSignalIds.length
    ? await loadCatalogMovies(supabase, {
        limit: missingSignalIds.length,
        movieIds: missingSignalIds,
        includeRecommendationMetadata: true,
      })
    : [];
  for (const movie of signalMovies) candidateById.set(movie.id, movie);

  const interactions: RecommendationInteraction[] = rows.flatMap((row) => {
    const movie = candidateById.get(row.movie_id);
    return movie
      ? [
          {
            movie,
            status: row.status,
            isFavorite: row.is_favorite,
            rating: row.rating,
          } satisfies RecommendationInteraction,
        ]
      : [];
  });
  const viewCounts = new Map<string, number>();
  for (const event of eventRows) {
    if (event.movie_id) {
      viewCounts.set(event.movie_id, (viewCounts.get(event.movie_id) ?? 0) + 1);
    }
  }
  for (const [movieId, count] of viewCounts) {
    const movie = candidateById.get(movieId);
    if (!movie) continue;
    interactions.push({
      movie,
      status: "NONE",
      isFavorite: false,
      rating: null,
      weight: Math.min(1.5, 0.35 * count),
      exclude: false,
    });
  }
  const personalizationEnabled =
    preferenceRow?.personalization_enabled !== false;
  const seedMovie = options?.seedMovieId
    ? candidateById.get(options.seedMovieId)
    : undefined;
  const searchPlans = eventRows.flatMap((event) =>
    event.event_name === "search" && event.query
      ? [analyzeSearchQuery(event.query)]
      : [],
  );
  const historyGenres = [
    ...new Set(
      searchPlans.flatMap((plan) =>
        Object.entries(plan.preferredGenres)
          .filter(([, weight]) => weight >= 2)
          .map(([genre]) => genre),
      ),
    ),
  ];
  const historyEmotions = [
    ...new Set(searchPlans.flatMap((plan) => plan.preferredEmotionalTags)),
  ];
  const profile = buildPreferenceProfile(
    personalizationEnabled ? interactions : [],
    {
      enabled: personalizationEnabled,
      genres: personalizationEnabled
        ? [...(preferenceRow?.preferred_genres ?? []), ...historyGenres]
        : [],
      emotions: personalizationEnabled
        ? [...(preferenceRow?.preferred_emotions ?? []), ...historyEmotions]
        : [],
    },
    seedMovie,
  );
  const recommendations = recommendMovies(candidates, profile, {
    limit: options?.limit,
    now,
  });
  const meaningfulSignals =
    Boolean(seedMovie) ||
    (personalizationEnabled &&
      (interactions.some(
        (item) => item.isFavorite || item.status !== "NONE" || item.rating,
      ) ||
        (preferenceRow?.preferred_genres?.length ?? 0) > 0 ||
        (preferenceRow?.preferred_emotions?.length ?? 0) > 0 ||
        eventRows.length > 0));

  return {
    movies: recommendations,
    personalized: meaningfulSignals,
    personalizationEnabled,
    onboardingCompleted: preferenceRow?.onboarding_completed ?? false,
    signalCount: interactions.length + eventRows.length,
  };
}
