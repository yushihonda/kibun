import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { buildEmotionProfile } from "./sync/emotions.js";
import { MANUAL_MOVIE_METADATA } from "./sync/manual-metadata.js";
import type { TmdbDetails, TmdbGenre } from "./sync/types.js";
import { describeError, retrySupabaseQuery } from "./supabase-query.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

type MovieRow = {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  original_title: string;
  overview: string;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: string[];
  runtime: number | null;
  status: string;
  tagline: string;
  homepage: string;
  imdb_id: string | null;
  popularity: number;
  vote_average: number;
  vote_count: number;
  adult: boolean;
  original_language: string;
  origin_countries: string[];
  emotional_scores: Record<string, number>;
  keywords: string[];
};

type OverrideRow = {
  movie_id: string;
  tag: string;
  intensity: number | string;
};

async function inParallel<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    }),
  );
}

function detailsFromRow(row: MovieRow): TmdbDetails {
  return {
    id: row.tmdb_id,
    media_type: row.media_type,
    title: row.title,
    original_title: row.original_title,
    overview: row.overview,
    release_date: row.release_date ?? undefined,
    poster_path: row.poster_path,
    backdrop_path: row.backdrop_path,
    genres: row.genres.map(
      (name, index) => ({ id: index + 1, name }) satisfies TmdbGenre,
    ),
    runtime: row.runtime,
    status: row.status,
    tagline: row.tagline,
    homepage: row.homepage,
    imdb_id: row.imdb_id,
    popularity: Number(row.popularity),
    vote_average: Number(row.vote_average),
    vote_count: row.vote_count,
    adult: row.adult,
    original_language: row.original_language,
    origin_country: row.origin_countries,
    keywords: {
      keywords: (row.keywords ?? []).map((name, index) => ({
        id: index + 1,
        name,
      })),
    },
    number_of_seasons: null,
    number_of_episodes: null,
  };
}

async function main() {
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const pageSize = 250;
  const concurrency = Math.max(
    1,
    Math.min(20, Number(process.env.EMOTION_BACKFILL_CONCURRENCY) || 5),
  );
  const force = process.env.EMOTION_BACKFILL_FORCE === "true";
  const { data: overrideData } = await retrySupabaseQuery(
    "load emotion overrides",
    () =>
      supabase.from("movie_emotion_overrides").select("movie_id,tag,intensity"),
  );
  const overridesByMovie = new Map<string, Record<string, number>>();
  for (const row of (overrideData ?? []) as OverrideRow[]) {
    const scores = overridesByMovie.get(row.movie_id) ?? {};
    scores[row.tag] = Number(row.intensity);
    overridesByMovie.set(row.movie_id, scores);
  }
  let processed = 0;
  let tagged = 0;
  let lastId: string | null = null;
  for (;;) {
    const { data } = await retrySupabaseQuery(
      "load emotion backfill page",
      () => {
        let query = supabase
          .from("movies")
          .select(
            "id,tmdb_id,media_type,title,original_title,overview,release_date,poster_path,backdrop_path,genres,runtime,status,tagline,homepage,imdb_id,popularity,vote_average,vote_count,adult,original_language,origin_countries,emotional_scores,keywords",
          )
          .order("id")
          .limit(pageSize);
        if (!force) query = query.is("emotion_updated_at", null);
        if (lastId) query = query.gt("id", lastId);
        return query;
      },
    );
    const rows = (data ?? []) as MovieRow[];
    if (!rows.length) break;
    lastId = rows.at(-1)?.id ?? lastId;

    const updatedAt = new Date().toISOString();
    await inParallel(rows, concurrency, async (row) => {
      const profile = buildEmotionProfile(detailsFromRow(row), {
        existingScores: row.emotional_scores ?? {},
        databaseOverrides: overridesByMovie.get(row.id),
      });
      const aliases = [
        row.original_title,
        ...(row.media_type === "movie"
          ? (MANUAL_MOVIE_METADATA[row.tmdb_id]?.aliases ?? [])
          : []),
      ]
        .map((alias) => alias?.trim())
        .filter(
          (alias, index, items): alias is string =>
            Boolean(alias) &&
            alias !== row.title &&
            items.indexOf(alias) === index,
        );
      await retrySupabaseQuery(`update emotions for movie ${row.id}`, () =>
        supabase
          .from("movies")
          .update({
            emotional_tags: profile.tags,
            ai_emotion_tags: profile.tags,
            emotional_scores: profile.scores,
            emotion_source: profile.source,
            emotion_updated_at: updatedAt,
            aliases,
          })
          .eq("id", row.id),
      );
      processed += 1;
      if (profile.tags.length) tagged += 1;
    });
    console.log(JSON.stringify({ processed, tagged }));
    if (rows.length < pageSize) break;
  }
  console.log(
    JSON.stringify({ processed, tagged, force, completed: true }, null, 2),
  );
}

void main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
