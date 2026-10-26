import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShelfItem } from "@/features/me/my-shelf";
import { loadCatalogMovies } from "@/lib/movies/catalog";

type ShelfRow = {
  status: "WATCHED" | "WATCHLIST" | "NONE";
  is_favorite: boolean;
  rating: number | null;
  updated_at: string;
  movie: {
    id: string;
    title: string;
    poster_path: string | null;
  } | null;
};

export async function loadShelfItems(
  supabase: SupabaseClient,
  userId: string,
): Promise<ShelfItem[]> {
  const { data } = await supabase
    .from("user_movie_interactions")
    .select(
      "status,is_favorite,rating,updated_at,movie:movies(id,title,poster_path)",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  const shelf = (data ?? []) as unknown as ShelfRow[];
  const movieIds = shelf.flatMap((item) => (item.movie ? [item.movie.id] : []));
  const movies = movieIds.length
    ? await loadCatalogMovies(supabase, {
        movieIds,
        limit: 500,
      }).catch(() => [])
    : [];
  const moviesById = new Map(movies.map((movie) => [movie.id, movie]));
  return shelf.map((item) => ({
    key: item.movie?.id ?? item.updated_at,
    title: item.movie?.title ?? "削除された作品",
    posterUrl: item.movie?.poster_path
      ? `https://image.tmdb.org/t/p/w780${item.movie.poster_path}`
      : null,
    status: item.status,
    isFavorite: item.is_favorite,
    rating: item.rating,
    movie: (item.movie && moviesById.get(item.movie.id)) ?? null,
  }));
}
