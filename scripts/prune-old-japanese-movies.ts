import "./load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Candidate = {
  id: string;
  tmdb_id: number;
  title: string;
  release_date: string;
  vote_average: number | string;
  vote_count: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]?.trim() || fallback);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

function cutoffDate(): string {
  const value = required("JAPANESE_MOVIE_CUTOFF");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("JAPANESE_MOVIE_CUTOFF must use YYYY-MM-DD");
  }
  return value;
}

async function loadCandidates(
  client: SupabaseClient,
  cutoff: string,
): Promise<Candidate[]> {
  const rows: Candidate[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("movies")
      .select("id,tmdb_id,title,release_date,vote_average,vote_count")
      .eq("media_type", "movie")
      .or("sources.cs.{japan},origin_countries.cs.{JP},original_language.eq.ja")
      .lt("release_date", cutoff)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Candidate[]));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

async function protectReferencedMovies(
  client: SupabaseClient,
  candidateIds: string[],
): Promise<Set<string>> {
  const protectedIds = new Set<string>();
  const references: Array<{ table: string; extraFilter?: string }> = [
    { table: "user_movie_interactions" },
    { table: "reviews" },
    { table: "editorial_picks" },
    { table: "movie_emotion_overrides" },
    { table: "search_feedback" },
    { table: "movie_aliases", extraFilter: "manual" },
  ];
  const chunkSize = 150;
  for (let offset = 0; offset < candidateIds.length; offset += chunkSize) {
    const ids = candidateIds.slice(offset, offset + chunkSize);
    for (const reference of references) {
      let query = client
        .from(reference.table)
        .select("movie_id")
        .in("movie_id", ids);
      if (reference.extraFilter) {
        query = query.eq("kind", reference.extraFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      for (const row of data ?? []) protectedIds.add(String(row.movie_id));
    }
  }
  return protectedIds;
}

async function main() {
  const cutoff = cutoffDate();
  const minimumRating = positiveNumber("JAPANESE_CLASSIC_MIN_RATING", 7);
  const minimumVotes = positiveNumber("JAPANESE_CLASSIC_MIN_VOTES", 100);
  const popularMinimumVotes = positiveNumber(
    "JAPANESE_CLASSIC_POPULAR_MIN_VOTES",
    150,
  );
  const popularMinimumRating = positiveNumber(
    "JAPANESE_CLASSIC_POPULAR_MIN_RATING",
    6.5,
  );
  const apply =
    process.env.PRUNE_OLD_JAPANESE_MOVIES_APPLY?.trim().toLowerCase() ===
    "true";
  const client = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const candidates = await loadCandidates(client, cutoff);
  const referencedIds = await protectReferencedMovies(
    client,
    candidates.map(({ id }) => id),
  );
  const classics = candidates.filter(
    (movie) =>
      (Number(movie.vote_average) >= minimumRating &&
        Number(movie.vote_count) >= minimumVotes) ||
      (Number(movie.vote_average) >= popularMinimumRating &&
        Number(movie.vote_count) >= popularMinimumVotes),
  );
  const classicIds = new Set(classics.map(({ id }) => id));
  const deletions = candidates.filter(
    ({ id }) => !classicIds.has(id) && !referencedIds.has(id),
  );

  let deleted = 0;
  if (apply) {
    const chunkSize = 100;
    for (let offset = 0; offset < deletions.length; offset += chunkSize) {
      const ids = deletions
        .slice(offset, offset + chunkSize)
        .map(({ id }) => id);
      const { data, error } = await client
        .from("movies")
        .delete()
        .in("id", ids)
        .select("id");
      if (error) throw error;
      deleted += data?.length ?? 0;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        cutoff,
        classicRule: {
          minimumRating,
          minimumVotes,
          popularMinimumRating,
          popularMinimumVotes,
        },
        oldJapaneseCandidates: candidates.length,
        preservedClassics: classics.length,
        preservedReferenced: referencedIds.size,
        deleteCandidates: deletions.length,
        deleted,
        deletionSample: deletions.slice(0, 20).map((movie) => ({
          tmdbId: movie.tmdb_id,
          title: movie.title,
          releaseDate: movie.release_date,
          rating: Number(movie.vote_average),
          votes: movie.vote_count,
        })),
      },
      null,
      2,
    ),
  );
}

void main();
