import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityComment } from "@/lib/community/comments";
import { loadCatalogMovies } from "@/lib/movies/catalog";
import type { Movie } from "@/types/movie";

// Full movie records let comment lists open the shared detail popup.
export async function loadCommentMovies(
  supabase: SupabaseClient,
  comments: CommunityComment[],
): Promise<Record<string, Movie>> {
  const ids = [
    ...new Set(comments.flatMap((comment) => comment.movie?.id ?? [])),
  ];
  if (!ids.length) return {};
  const movies = await loadCatalogMovies(supabase, {
    movieIds: ids,
    limit: ids.length,
  }).catch(() => []);
  return Object.fromEntries(movies.map((movie) => [movie.id, movie]));
}
