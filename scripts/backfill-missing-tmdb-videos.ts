import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { TmdbClient } from "./sync/tmdb.js";
import { selectYouTubeVideo } from "./sync/youtube.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const client = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const tmdb = new TmdbClient(required("TMDB_BEARER_TOKEN"));
  const movies: Array<{ id: string; tmdb_id: number }> = [];
  const pageSize = 1_000;
  const concurrency = Number(process.env.SYNC_CONCURRENCY?.trim() || "5");

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("movies")
      .select("id,tmdb_id")
      .is("youtube_video_key", null)
      .not("tmdb_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    movies.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }

  let backfilled = 0;
  let unavailable = 0;
  const failures: Array<{ tmdbId: number; message: string }> = [];
  const queue = [...movies];

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      let movie: (typeof movies)[number] | undefined;
      while ((movie = queue.shift())) {
        try {
          const video = selectYouTubeVideo(
            (await tmdb.details(movie.tmdb_id)).videos?.results ?? [],
          );
          if (!video) {
            unavailable += 1;
            continue;
          }
          const { error: movieError } = await client
            .from("movies")
            .update({ youtube_video_key: video.key })
            .eq("id", movie.id);
          if (movieError) throw movieError;
          const { error: videoError } = await client
            .from("movie_videos")
            .upsert(
              {
                movie_id: movie.id,
                platform: "youtube",
                video_id: video.key,
                url: `https://www.youtube.com/watch?v=${video.key}`,
                status: "approved",
              },
              { onConflict: "platform,video_id" },
            );
          if (videoError) throw videoError;
          backfilled += 1;
        } catch (error) {
          failures.push({
            tmdbId: movie.tmdb_id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  console.log(
    JSON.stringify(
      {
        checked: movies.length,
        backfilled,
        unavailable,
        failed: failures.length,
        failures: failures.slice(0, 20),
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
}

void main();
