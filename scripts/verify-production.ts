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
  const theatricalSince = new Date(Date.now() - 4 * 86_400_000).toISOString();
  const [movies, videos, providers, providerLogos, nowPlaying, feedRanking] =
    await Promise.all([
      supabase
        .from("movies")
        .select("id,media_type,emotional_scores,theatrical_at")
        .limit(1),
      supabase
        .from("movie_videos")
        .select("id")
        .eq("status", "approved")
        .limit(1),
      supabase.from("provider_availability_history").select("id").limit(1),
      supabase
        .from("providers")
        .select("logo_path")
        .not("logo_path", "is", null)
        .limit(1),
      supabase
        .from("movies")
        .select("id", { count: "exact", head: true })
        .eq("media_type", "movie")
        .gte("theatrical_at", theatricalSince),
      supabase.rpc("most_saved_movies", { p_limit: 1 }),
    ]);
  for (const [name, result] of Object.entries({
    movies,
    videos,
    providers,
    providerLogos,
    nowPlaying,
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
    providerLogoRead: providerLogos.data?.length === 1,
    nowPlayingMovies: nowPlaying.count ?? 0,
    savedRankingRpc: Array.isArray(feedRanking.data),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (
    Object.entries(summary).some(([, value]) =>
      typeof value === "number" ? value < 1 : !value,
    )
  ) {
    process.exitCode = 1;
  }
}

void main();
