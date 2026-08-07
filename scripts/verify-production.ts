import "./load-env";
import { createClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const [movies, videos, providers, feedRanking] = await Promise.all([
    supabase.from("movies").select("id,media_type,emotional_scores").limit(1),
    supabase
      .from("movie_videos")
      .select("id")
      .eq("status", "approved")
      .limit(1),
    supabase.from("provider_availability_history").select("id").limit(1),
    supabase.rpc("most_saved_movies", { p_limit: 1 }),
  ]);
  for (const [name, result] of Object.entries({
    movies,
    videos,
    providers,
    feedRanking,
  })) {
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
  }
  const summary = {
    publicMovieRead: movies.data?.length === 1,
    mediaTypesReady: movies.data?.every((movie) =>
      ["movie", "tv"].includes(movie.media_type),
    ),
    approvedVideoRead: videos.data?.length === 1,
    providerHistoryRead: providers.data?.length === 1,
    savedRankingRpc: Array.isArray(feedRanking.data),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (Object.values(summary).some((value) => !value)) process.exitCode = 1;
}

void main();
