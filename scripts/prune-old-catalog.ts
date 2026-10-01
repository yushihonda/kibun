import "./load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEARCH_RELEVANCE_CASES } from "./search-evaluation/cases.js";

type PruneScope = "all" | "movies" | "tv" | "japanese-movies";

type Candidate = {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  release_date: string;
  vote_average: number | string;
  vote_count: number;
  sources: string[];
  origin_countries: string[];
  original_language: string | null;
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
  const value = required("CATALOG_RELEASE_CUTOFF");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("CATALOG_RELEASE_CUTOFF must use a valid YYYY-MM-DD date");
  }
  return value;
}

function pruneScope(): PruneScope {
  const value = required("CATALOG_PRUNE_SCOPE");
  if (
    value !== "all" &&
    value !== "movies" &&
    value !== "tv" &&
    value !== "japanese-movies"
  ) {
    throw new Error(
      "CATALOG_PRUNE_SCOPE must be all, movies, tv, or japanese-movies",
    );
  }
  return value;
}

function isJapaneseMovie(movie: Candidate): boolean {
  return (
    movie.media_type === "movie" &&
    (movie.sources?.includes("japan") ||
      movie.origin_countries?.includes("JP") ||
      movie.original_language === "ja")
  );
}

function isInScope(movie: Candidate, scope: PruneScope): boolean {
  if (scope === "movies") return movie.media_type === "movie";
  if (scope === "tv") return movie.media_type === "tv";
  if (scope === "japanese-movies") return isJapaneseMovie(movie);
  return true;
}

async function loadCandidates(
  client: SupabaseClient,
  cutoff: string,
  scope: PruneScope,
): Promise<Candidate[]> {
  const rows: Candidate[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("movies")
      .select(
        "id,tmdb_id,media_type,title,release_date,vote_average,vote_count,sources,origin_countries,original_language",
      )
      .lt("release_date", cutoff)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Candidate[]));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows.filter((movie) => isInScope(movie, scope));
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

function countByMediaType(movies: Candidate[]) {
  return {
    movies: movies.filter(({ media_type }) => media_type === "movie").length,
    dramas: movies.filter(({ media_type }) => media_type === "tv").length,
  };
}

async function main() {
  const cutoff = cutoffDate();
  const scope = pruneScope();
  const minimumRating = positiveNumber("CATALOG_CLASSIC_MIN_RATING", 7);
  const minimumVotes = positiveNumber("CATALOG_CLASSIC_MIN_VOTES", 100);
  const popularMinimumVotes = positiveNumber(
    "CATALOG_CLASSIC_POPULAR_MIN_VOTES",
    150,
  );
  const popularMinimumRating = positiveNumber(
    "CATALOG_CLASSIC_POPULAR_MIN_RATING",
    6.5,
  );
  const widelyRatedMinimumVotes = positiveNumber(
    "CATALOG_CLASSIC_WIDELY_RATED_MIN_VOTES",
    1_000,
  );
  const widelyRatedMinimumRating = positiveNumber(
    "CATALOG_CLASSIC_WIDELY_RATED_MIN_RATING",
    6,
  );
  const apply =
    process.env.PRUNE_OLD_CATALOG_APPLY?.trim().toLowerCase() === "true";
  const client = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const candidates = await loadCandidates(client, cutoff, scope);
  const referencedIds = await protectReferencedMovies(
    client,
    candidates.map(({ id }) => id),
  );
  const evaluationTmdbIds = new Set<number>(
    SEARCH_RELEVANCE_CASES.flatMap((evaluationCase) =>
      evaluationCase.judgments.map(({ tmdbId }) => tmdbId),
    ),
  );
  const evaluationIds = new Set(
    candidates
      .filter(
        ({ media_type, tmdb_id }) =>
          media_type === "movie" && evaluationTmdbIds.has(tmdb_id),
      )
      .map(({ id }) => id),
  );
  const classics = candidates.filter(
    (movie) =>
      (Number(movie.vote_average) >= minimumRating &&
        Number(movie.vote_count) >= minimumVotes) ||
      (Number(movie.vote_average) >= popularMinimumRating &&
        Number(movie.vote_count) >= popularMinimumVotes) ||
      (Number(movie.vote_average) >= widelyRatedMinimumRating &&
        Number(movie.vote_count) >= widelyRatedMinimumVotes),
  );
  const classicIds = new Set(classics.map(({ id }) => id));
  const deletions = candidates.filter(
    ({ id }) =>
      !classicIds.has(id) && !referencedIds.has(id) && !evaluationIds.has(id),
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
        scope,
        cutoff,
        classicRule: {
          minimumRating,
          minimumVotes,
          popularMinimumRating,
          popularMinimumVotes,
          widelyRatedMinimumRating,
          widelyRatedMinimumVotes,
        },
        oldCandidates: {
          total: candidates.length,
          ...countByMediaType(candidates),
        },
        preservedClassics: {
          total: classics.length,
          ...countByMediaType(classics),
        },
        preservedReferenced: referencedIds.size,
        preservedSearchEvaluation: evaluationIds.size,
        deleteCandidates: {
          total: deletions.length,
          ...countByMediaType(deletions),
        },
        deleted,
        deletionSample: deletions.slice(0, 20).map((movie) => ({
          tmdbId: movie.tmdb_id,
          mediaType: movie.media_type,
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
