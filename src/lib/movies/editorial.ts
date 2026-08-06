import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProviders } from "@/lib/providers/catalog";
import type { Movie, MovieVideo, OfferType, Provider } from "@/types/movie";

type MovieRow = {
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
  popularity: number | string;
  genres: string[] | null;
  emotional_tags: string[] | null;
};

type VideoRow = {
  movie_id: string;
  platform: "youtube" | "tiktok";
  video_id: string;
  url: string | null;
};

type ProviderJoinRow = {
  movie_id: string;
  offer_type: OfferType;
  providers:
    | {
        tmdb_provider_id: number;
        name: string;
        slug: string;
      }
    | {
        tmdb_provider_id: number;
        name: string;
        slug: string;
      }[]
    | null;
};

type EditorialPickRow = {
  movie_id: string;
  comment: string;
  sort_order: number;
};

const image = (path: string | null, size: "w780" | "w1280") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : "/placeholder-movie.svg";

function pickVideo(videos: VideoRow[]): MovieVideo | undefined {
  const youtube = videos.find((video) => video.platform === "youtube");
  const chosen = youtube ?? videos[0];
  if (!chosen) return undefined;
  return {
    platform: chosen.platform,
    videoId: chosen.video_id,
    url: chosen.url ?? undefined,
  };
}

function mapProviders(rows: ProviderJoinRow[]): Provider[] {
  const mapped: Provider[] = [];
  for (const row of rows) {
    const provider = Array.isArray(row.providers)
      ? row.providers[0]
      : row.providers;
    if (!provider) continue;
    mapped.push({
      id: provider.tmdb_provider_id,
      name: provider.name,
      slug: provider.slug,
      type: row.offer_type,
    });
  }
  return normalizeProviders(mapped);
}

export async function loadEditorialMovies(
  supabase: SupabaseClient,
): Promise<Movie[]> {
  const { data: picks, error: picksError } = await supabase
    .from("editorial_picks")
    .select("movie_id,comment,sort_order")
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .limit(24);

  if (picksError) throw picksError;
  const pickRows = (picks ?? []) as EditorialPickRow[];
  if (!pickRows.length) return [];

  const movieIds = pickRows.map((pick) => pick.movie_id);
  const [
    { data: movies, error: moviesError },
    { data: videos },
    { data: providerRows },
  ] = await Promise.all([
    supabase
      .from("movies")
      .select(
        "id,tmdb_id,title,original_title,overview,poster_path,backdrop_path,release_date,runtime,vote_average,popularity,genres,emotional_tags",
      )
      .in("id", movieIds),
    supabase
      .from("movie_videos")
      .select("movie_id,platform,video_id,url")
      .in("movie_id", movieIds)
      .eq("status", "approved"),
    supabase
      .from("movie_providers")
      .select("movie_id,offer_type,providers(tmdb_provider_id,name,slug)")
      .in("movie_id", movieIds)
      .eq("country", "JP"),
  ]);

  if (moviesError) throw moviesError;

  const movieMap = new Map(
    ((movies ?? []) as MovieRow[]).map((movie) => [movie.id, movie]),
  );
  const videosByMovie = new Map<string, VideoRow[]>();
  for (const video of (videos ?? []) as VideoRow[]) {
    const list = videosByMovie.get(video.movie_id) ?? [];
    list.push(video);
    videosByMovie.set(video.movie_id, list);
  }
  const providersByMovie = new Map<string, ProviderJoinRow[]>();
  for (const row of (providerRows ?? []) as ProviderJoinRow[]) {
    const list = providersByMovie.get(row.movie_id) ?? [];
    list.push(row);
    providersByMovie.set(row.movie_id, list);
  }

  return pickRows.flatMap((pick) => {
    const row = movieMap.get(pick.movie_id);
    if (!row) return [];
    return [
      {
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
        popularity: Number(row.popularity),
        genres: row.genres ?? [],
        emotionalTags: row.emotional_tags ?? [],
        providers: mapProviders(providersByMovie.get(row.id) ?? []),
        video: pickVideo(videosByMovie.get(row.id) ?? []),
        editorialComment: pick.comment.trim() || undefined,
      } satisfies Movie,
    ];
  });
}
