import "./load-env";
import { createClient } from "@supabase/supabase-js";

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
  const movies: Array<{
    id: string;
    youtube_video_key: string | null;
  }> = [];
  const pageSize = 1_000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("movies")
      .select("id,youtube_video_key")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    movies.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }

  const uniqueVideos = new Map<string, (typeof movies)[number]>();
  for (const movie of movies) {
    const key = movie.youtube_video_key?.trim();
    if (key && !uniqueVideos.has(key)) uniqueVideos.set(key, movie);
  }
  const rows = [...uniqueVideos.entries()].map(([videoKey, movie]) => ({
    movie_id: movie.id,
    platform: "youtube",
    video_id: videoKey,
    url: `https://www.youtube.com/watch?v=${videoKey}`,
    status: "approved",
  }));

  for (let from = 0; from < rows.length; from += 200) {
    const { error } = await client
      .from("movie_videos")
      .upsert(rows.slice(from, from + 200), {
        onConflict: "platform,video_id",
      });
    if (error) throw error;
  }

  console.log(
    JSON.stringify(
      {
        movies: movies.length,
        videosBackfilled: rows.length,
        moviesWithoutTmdbVideo: movies.length - rows.length,
      },
      null,
      2,
    ),
  );
}

void main();
