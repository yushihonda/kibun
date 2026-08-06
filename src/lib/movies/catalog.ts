import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProviders } from "@/lib/providers/catalog";
import type {
  Movie,
  MoviePerson,
  MovieVideo,
  OfferType,
  Provider,
} from "@/types/movie";

type CatalogRow = {
  id: string;
  tmdb_id: number;
  title: string;
  original_title: string | null;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  vote_average: number | string;
  vote_count: number;
  popularity: number | string;
  genres: string[] | null;
  emotional_tags: string[] | null;
  emotional_scores?: Record<string, number> | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  origin_countries?: string[] | null;
  tmdb_cast?: MoviePerson[] | null;
  tmdb_directors?: MoviePerson[] | null;
  tmdb_collection_id?: number | null;
  providers_checked_at: string | null;
  created_at: string;
  last_synced_at: string | null;
};

type VideoRow = {
  movie_id: string;
  platform: "youtube" | "tiktok";
  video_id: string;
  url: string | null;
  created_at: string;
};

type ProviderJoinRow = {
  movie_id: string;
  offer_type: OfferType;
  tmdb_link: string | null;
  updated_at: string;
  providers:
    | { tmdb_provider_id: number; name: string; slug: string }
    | Array<{ tmdb_provider_id: number; name: string; slug: string }>
    | null;
};

export type CatalogMovie = Movie & {
  voteCount: number;
  createdAt: string;
  lastSyncedAt?: string;
};

const image = (path: string | null, size: "w780" | "w1280") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : "/placeholder-movie.svg";

function chooseVideo(videos: VideoRow[]): MovieVideo | undefined {
  const selected =
    videos.find((video) => video.platform === "youtube") ?? videos[0];
  return selected
    ? {
        platform: selected.platform,
        videoId: selected.video_id,
        url: selected.url ?? undefined,
      }
    : undefined;
}

function mapProviders(rows: ProviderJoinRow[]): Provider[] {
  return normalizeProviders(
    rows.flatMap((row) => {
      const provider = Array.isArray(row.providers)
        ? row.providers[0]
        : row.providers;
      if (!provider) return [];
      return [
        {
          id: provider.tmdb_provider_id,
          name: provider.name,
          slug: provider.slug,
          type: row.offer_type,
          tmdbLink: row.tmdb_link ?? undefined,
          checkedAt: row.updated_at,
        } satisfies Provider,
      ];
    }),
  );
}

export async function loadCatalogMovies(
  supabase: SupabaseClient,
  options?: {
    limit?: number;
    movieIds?: string[];
    requireVideo?: boolean;
    includeRecommendationMetadata?: boolean;
  },
): Promise<CatalogMovie[]> {
  const limit = Math.min(Math.max(options?.limit ?? 240, 1), 500);
  const recommendationFields = options?.includeRecommendationMetadata
    ? ",emotional_scores,aliases,keywords,origin_countries,tmdb_cast,tmdb_directors,tmdb_collection_id"
    : "";
  let query = supabase
    .from("movies")
    .select(
      `id,tmdb_id,title,original_title,overview,poster_path,backdrop_path,release_date,runtime,vote_average,vote_count,popularity,genres,emotional_tags,providers_checked_at,created_at,last_synced_at${recommendationFields}`,
    )
    .eq("adult", false)
    .order("popularity", { ascending: false })
    .limit(limit);
  if (options?.movieIds?.length) query = query.in("id", options.movieIds);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as CatalogRow[];
  if (!rows.length) return [];
  const ids = rows.map((movie) => movie.id);
  const idBatches = Array.from(
    { length: Math.ceil(ids.length / 100) },
    (_, index) => ids.slice(index * 100, (index + 1) * 100),
  );
  const relatedResults = await Promise.all(
    idBatches.map(async (batch) =>
      Promise.all([
        supabase
          .from("movie_videos")
          .select("movie_id,platform,video_id,url,created_at")
          .in("movie_id", batch)
          .eq("status", "approved"),
        supabase
          .from("movie_providers")
          .select(
            "movie_id,offer_type,tmdb_link,updated_at,providers(tmdb_provider_id,name,slug)",
          )
          .in("movie_id", batch)
          .eq("country", "JP"),
      ]),
    ),
  );
  const videos: unknown[] = [];
  const providerRows: unknown[] = [];
  for (const [videoResult, providerResult] of relatedResults) {
    if (videoResult.error) throw videoResult.error;
    if (providerResult.error) throw providerResult.error;
    videos.push(...(videoResult.data ?? []));
    providerRows.push(...(providerResult.data ?? []));
  }

  const videosByMovie = new Map<string, VideoRow[]>();
  for (const video of videos as VideoRow[]) {
    const list = videosByMovie.get(video.movie_id) ?? [];
    list.push(video);
    videosByMovie.set(video.movie_id, list);
  }
  const providersByMovie = new Map<string, ProviderJoinRow[]>();
  for (const provider of providerRows as ProviderJoinRow[]) {
    const list = providersByMovie.get(provider.movie_id) ?? [];
    list.push(provider);
    providersByMovie.set(provider.movie_id, list);
  }

  const mapped = rows.map((row) => ({
    id: row.id,
    tmdbId: Number(row.tmdb_id),
    title: row.title,
    originalTitle: row.original_title ?? undefined,
    overview: row.overview,
    posterUrl: image(row.poster_path, "w780"),
    backdropUrl: image(row.backdrop_path ?? row.poster_path, "w1280"),
    releaseDate: row.release_date ?? "",
    runtime: row.runtime ?? 0,
    voteAverage: Number(row.vote_average),
    voteCount: row.vote_count,
    popularity: Number(row.popularity),
    genres: row.genres ?? [],
    emotionalTags: row.emotional_tags ?? [],
    emotionScores: row.emotional_scores ?? undefined,
    aliases: row.aliases ?? undefined,
    keywords: row.keywords ?? undefined,
    originCountries: row.origin_countries ?? undefined,
    cast: row.tmdb_cast ?? undefined,
    directors: row.tmdb_directors ?? undefined,
    collectionId: row.tmdb_collection_id ?? undefined,
    providersCheckedAt: row.providers_checked_at ?? undefined,
    providers: mapProviders(providersByMovie.get(row.id) ?? []),
    video: chooseVideo(videosByMovie.get(row.id) ?? []),
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at ?? undefined,
  })) satisfies CatalogMovie[];

  return options?.requireVideo
    ? mapped.filter((movie) => Boolean(movie.video))
    : mapped;
}
