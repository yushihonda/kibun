import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  isNowPlayingTitle,
  isRecentTitle,
  isUpcomingTitle,
  recentScore,
  theatricalScore,
} from "@/lib/discovery/ranking";
import { loadCatalogMovies } from "@/lib/movies/catalog";
import { PROVIDER_FILTERS } from "@/lib/providers/catalog";
import { buildSearchRails } from "@/lib/search/category-rails";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { Movie, MovieRail } from "@/types/movie";

const SEARCH_LANDING_TTL_MS = 5 * 60 * 1_000;
const MAX_LANDING_MOVIES_PER_RAIL = 8;

type SearchLanding = {
  sections: MovieRail[];
  providerLogos: Record<string, string>;
};

let cachedLanding: { value: SearchLanding; expiresAt: number } | null = null;
let pendingLanding: Promise<SearchLanding> | null = null;

function featuredRail(
  id: string,
  title: string,
  description: string,
  movies: Movie[],
  generatedAt: string,
): MovieRail | null {
  const selected = movies.slice(0, MAX_LANDING_MOVIES_PER_RAIL);
  return selected.length
    ? { id, title, description, movies: selected, generatedAt }
    : null;
}

async function buildSearchLanding(now: Date): Promise<SearchLanding> {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase public configuration is missing");
  const supabase = createSupabaseClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const trendingSince = new Date(now.getTime() - 10 * 86_400_000).toISOString();
  const releaseDateFrom = new Date(now.getTime() - 180 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const releaseDateTo = new Date(now.getTime() + 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const japaneseReleaseDateFrom = `${now.getUTCFullYear() - 3}-01-01`;
  const [trendingMovies, recentMovies, japaneseMovies, providerResult] =
    await Promise.all([
      loadCatalogMovies(supabase, {
        limit: 120,
        orderBy: "trending_at",
        trendingSince,
      }),
      loadCatalogMovies(supabase, {
        limit: 120,
        orderBy: "release_date",
        releaseDateFrom,
        releaseDateTo,
      }),
      loadCatalogMovies(supabase, {
        limit: 64,
        orderBy: "popularity",
        mediaTypes: ["movie"],
        sources: ["japan"],
        releaseDateFrom: japaneseReleaseDateFrom,
      }),
      supabase
        .from("providers")
        .select("tmdb_provider_id,logo_path")
        .in(
          "tmdb_provider_id",
          PROVIDER_FILTERS.flatMap((provider) => provider.tmdbProviderIds),
        ),
    ]);
  const movies = [
    ...new Map(
      [...trendingMovies, ...recentMovies].map(
        (movie) => [movie.id, movie] as const,
      ),
    ).values(),
  ];
  const generatedAt = now.toISOString();
  const nowPlaying = [...movies]
    .filter(
      (movie) => movie.mediaType === "movie" && isNowPlayingTitle(movie, now),
    )
    .sort(
      (a, b) =>
        theatricalScore(b, now) - theatricalScore(a, now) ||
        a.id.localeCompare(b.id),
    );
  const featured = [
    featuredRail(
      "now-playing-movies",
      "上映中の映画",
      "日本の劇場で上映中と確認できた映画",
      nowPlaying,
      generatedAt,
    ),
    featuredRail(
      "current-dramas",
      "新着・放送中のドラマ",
      "直近に配信開始、または現在放送中と確認できたドラマ",
      [...movies]
        .filter(
          (movie) =>
            movie.mediaType === "tv" &&
            (isUpcomingTitle(movie, now) || isRecentTitle(movie, now)),
        )
        .sort(
          (a, b) =>
            recentScore(b, now) - recentScore(a, now) ||
            a.id.localeCompare(b.id),
        ),
      generatedAt,
    ),
    featuredRail(
      "upcoming-movies",
      "近日公開の映画",
      "TMDBで日本向け近日公開として確認できた映画",
      [...movies]
        .filter(
          (movie) => movie.mediaType === "movie" && isUpcomingTitle(movie, now),
        )
        .sort(
          (a, b) =>
            recentScore(b, now) - recentScore(a, now) ||
            a.id.localeCompare(b.id),
        ),
      generatedAt,
    ),
    featuredRail(
      "japanese-movies",
      "邦画ピックアップ",
      "日本で制作された人気映画からおすすめを厳選",
      japaneseMovies,
      generatedAt,
    ),
    featuredRail(
      "trending-movies",
      "今週の話題映画",
      "TMDBの週間映画トレンドから選定",
      trendingMovies.filter((movie) => movie.mediaType === "movie"),
      generatedAt,
    ),
    featuredRail(
      "trending-dramas",
      "今週の話題ドラマ",
      "TMDBの週間ドラマトレンドから選定",
      trendingMovies.filter((movie) => movie.mediaType === "tv"),
      generatedAt,
    ),
  ].filter((rail): rail is MovieRail => Boolean(rail));
  const discovery = buildSearchRails(movies, null, {
    emptyQuery: true,
    now,
  })
    .filter((rail) => !featured.some((item) => item.id === rail.id))
    .map((rail) => ({
      ...rail,
      movies: rail.movies.slice(0, MAX_LANDING_MOVIES_PER_RAIL),
    }));
  const logoById = new Map(
    (providerResult.data ?? []).map((provider) => [
      Number(provider.tmdb_provider_id),
      provider.logo_path as string | null,
    ]),
  );
  const providerLogos = Object.fromEntries(
    PROVIDER_FILTERS.flatMap((provider) => {
      const logoPath = provider.tmdbProviderIds
        .map((id) => logoById.get(id))
        .find((path): path is string => Boolean(path));
      return logoPath ? [[provider.slug, logoPath]] : [];
    }),
  );
  return { sections: [...featured, ...discovery], providerLogos };
}

export async function loadPublicSearchLanding(): Promise<SearchLanding> {
  const now = Date.now();
  if (cachedLanding && cachedLanding.expiresAt > now) {
    return cachedLanding.value;
  }
  if (pendingLanding) return pendingLanding;
  pendingLanding = buildSearchLanding(new Date(now))
    .then((value) => {
      cachedLanding = {
        value,
        expiresAt: Date.now() + SEARCH_LANDING_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      pendingLanding = null;
    });
  return pendingLanding;
}
