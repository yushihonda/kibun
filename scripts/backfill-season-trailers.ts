import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { TmdbClient } from "./sync/tmdb.js";
import { selectSeasonTrailers } from "./sync/youtube.js";

// Fills the newest season and its trailer for shows that have more than one
// season, without touching the rest of each title the way a full catalog
// sync would (sources, trend flags, emotions).
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
  const shows: Array<{ id: string; tmdb_id: number }> = [];
  const pageSize = 1_000;
  const concurrency = Number(process.env.SYNC_CONCURRENCY?.trim() || "5");

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("movies")
      .select("id,tmdb_id")
      .eq("media_type", "tv")
      .gte("number_of_seasons", 2)
      .not("tmdb_id", "is", null)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    shows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }

  let updated = 0;
  let seasonTrailers = 0;
  const failures: Array<{ tmdbId: number; message: string }> = [];
  const queue = [...shows];

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      let show: (typeof shows)[number] | undefined;
      while ((show = queue.shift())) {
        try {
          const details = await tmdb.details(show.tmdb_id, "tv");
          const trailers = selectSeasonTrailers(details);
          const { error: movieError } = await client
            .from("movies")
            .update({
              latest_season_number: details.latest_season?.number ?? null,
              latest_season_air_date: details.latest_season?.air_date ?? null,
              ...(trailers[0] ? { youtube_video_key: trailers[0].key } : {}),
            })
            .eq("id", show.id);
          if (movieError) throw movieError;
          for (const trailer of trailers) {
            const { error: videoError } = await client
              .from("movie_videos")
              .upsert(
                {
                  movie_id: show.id,
                  platform: "youtube",
                  video_id: trailer.key,
                  url: `https://www.youtube.com/watch?v=${trailer.key}`,
                  status: "approved",
                  season_number: trailer.season,
                },
                { onConflict: "platform,video_id" },
              );
            if (videoError) throw videoError;
            if (trailer.season && trailer.season >= 2) seasonTrailers += 1;
          }
          updated += 1;
        } catch (error) {
          failures.push({
            tmdbId: show.tmdb_id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  console.log(
    JSON.stringify(
      {
        checked: shows.length,
        updated,
        seasonTrailers,
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
