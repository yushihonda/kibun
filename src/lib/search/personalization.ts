import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeSearchQuery,
  type SearchPersonalization,
} from "@/lib/search/query-intent";

type InteractionRow = {
  movie_id: string;
  status: "WATCHED" | "WATCHLIST" | "NONE";
  is_favorite: boolean;
  rating: number | null;
};

type SignalMovieRow = {
  id: string;
  genres: string[] | null;
  emotional_tags: string[] | null;
};

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    const key = trimmed?.toLocaleLowerCase("ja-JP");
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export async function loadSearchPersonalization(
  supabase: SupabaseClient,
): Promise<SearchPersonalization | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [preferenceResult, eventResult, interactionResult] = await Promise.all([
    supabase
      .from("user_preferences")
      .select("personalization_enabled,preferred_genres,preferred_emotions")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("product_events")
      .select("query")
      .eq("user_id", user.id)
      .eq("event_name", "search")
      .not("query", "is", null)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("user_movie_interactions")
      .select("movie_id,status,is_favorite,rating")
      .eq("user_id", user.id)
      .limit(80),
  ]);
  if (preferenceResult.data?.personalization_enabled === false) return null;

  const interactions = (interactionResult.data ?? []) as InteractionRow[];
  const signalMovieIds = interactions
    .filter(
      (row) =>
        row.is_favorite || row.status === "WATCHLIST" || (row.rating ?? 0) >= 4,
    )
    .map((row) => row.movie_id);
  const signalMovieResult = signalMovieIds.length
    ? await supabase
        .from("movies")
        .select("id,genres,emotional_tags")
        .in("id", [...new Set(signalMovieIds)].slice(0, 80))
    : { data: [] as SignalMovieRow[] };
  const signalMovies = (signalMovieResult.data ?? []) as SignalMovieRow[];
  const searchPlans = (eventResult.data ?? []).flatMap((event) =>
    event.query ? [analyzeSearchQuery(String(event.query))] : [],
  );
  const historyGenres = searchPlans.flatMap((plan) =>
    Object.entries(plan.preferredGenres)
      .filter(([, weight]) => weight >= 2)
      .map(([genre]) => genre),
  );
  const historyEmotions = searchPlans.flatMap(
    (plan) => plan.preferredEmotionalTags,
  );
  const preferredGenres = unique([
    ...(preferenceResult.data?.preferred_genres ?? []),
    ...signalMovies.flatMap((movie) => movie.genres ?? []),
    ...historyGenres,
  ]).slice(0, 12);
  const preferredEmotionalTags = unique([
    ...(preferenceResult.data?.preferred_emotions ?? []),
    ...signalMovies.flatMap((movie) => movie.emotional_tags ?? []),
    ...historyEmotions,
  ]).slice(0, 12);

  return preferredGenres.length || preferredEmotionalTags.length
    ? { preferredGenres, preferredEmotionalTags }
    : null;
}
