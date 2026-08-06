import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  SEARCH_RELEVANCE_CASES,
  type SearchRelevanceJudgment,
} from "./search-evaluation/cases";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const allJudgments: SearchRelevanceJudgment[] =
    SEARCH_RELEVANCE_CASES.flatMap(({ judgments }) => [...judgments]);
  const tmdbIds = [...new Set(allJudgments.map(({ tmdbId }) => tmdbId))];
  const { data, error } = await client
    .from("movies")
    .select("tmdb_id,title")
    .in("tmdb_id", tmdbIds);
  if (error) throw error;

  const storedById = new Map(
    (data ?? []).map((movie) => [Number(movie.tmdb_id), movie.title]),
  );
  const missing = tmdbIds.filter((tmdbId) => !storedById.has(tmdbId));
  if (missing.length) {
    throw new Error(`Missing synchronized TMDB IDs: ${missing.join(", ")}`);
  }

  const titleChanges = allJudgments.filter(
    ({ tmdbId, title }) => storedById.get(tmdbId) !== title,
  );
  console.log(
    JSON.stringify(
      {
        cases: SEARCH_RELEVANCE_CASES.map(({ id, query, judgments }) => ({
          id,
          query,
          judgments: judgments.length,
          relevant: judgments.filter(({ label }) => label === "relevant")
            .length,
          irrelevant: judgments.filter(({ label }) => label === "irrelevant")
            .length,
        })),
        uniqueMovies: tmdbIds.length,
        missingMovies: missing.length,
        titleChanges: titleChanges.map(({ tmdbId, title }) => ({
          tmdbId,
          expected: title,
          actual: storedById.get(tmdbId),
        })),
      },
      null,
      2,
    ),
  );
}

void main();
