import type { Movie, Provider } from "@/types/movie";
import { normalizeProviders } from "@/lib/providers/catalog";

export type SearchMovieRow = {
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
  emotional_scores?: Record<string, number> | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  origin_countries?: string[] | null;
  tmdb_cast?: Array<{ id: number; name: string }> | null;
  tmdb_directors?: Array<{ id: number; name: string }> | null;
  tmdb_collection_id?: number | null;
  providers_checked_at?: string | null;
  providers: Provider[] | null;
  video: Movie["video"] | null;
};

const image = (path: string | null, size: "w780" | "w1280") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : "/placeholder-movie.svg";

export function mapSearchMovie(row: SearchMovieRow): Movie {
  return {
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
    emotionScores: row.emotional_scores ?? undefined,
    aliases: row.aliases ?? undefined,
    keywords: row.keywords ?? undefined,
    originCountries: row.origin_countries ?? undefined,
    cast: row.tmdb_cast ?? undefined,
    directors: row.tmdb_directors ?? undefined,
    collectionId: row.tmdb_collection_id ?? undefined,
    providersCheckedAt: row.providers_checked_at ?? undefined,
    providers: normalizeProviders(row.providers ?? []),
    video: row.video ?? undefined,
  };
}
