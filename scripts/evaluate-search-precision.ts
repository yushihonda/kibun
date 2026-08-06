import "./load-env";
import { createClient } from "@supabase/supabase-js";
import baseline from "./search-evaluation/baseline.json";
import { SEARCH_RELEVANCE_CASES } from "./search-evaluation/cases.js";
import {
  analyzeSearchQuery,
  rankSearchBatchesWithScores,
} from "../src/lib/search/query-intent.js";
import type { Movie } from "../src/types/movie.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

type EvaluationRow = {
  id: string;
  tmdb_id: number;
  title: string;
  original_title: string | null;
  overview: string;
  genres: string[];
  emotional_tags: string[];
  emotional_scores: Record<string, number>;
  vote_average: number;
  popularity: number;
};

function mapMovie(row: EvaluationRow): Movie {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    title: row.title,
    originalTitle: row.original_title ?? undefined,
    overview: row.overview,
    posterUrl: "/placeholder-movie.svg",
    backdropUrl: "/placeholder-movie.svg",
    releaseDate: "",
    runtime: 0,
    voteAverage: Number(row.vote_average),
    popularity: Number(row.popularity),
    genres: row.genres ?? [],
    emotionalTags: row.emotional_tags ?? [],
    emotionScores: row.emotional_scores ?? {},
    providers: [],
  };
}

async function main() {
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const ids = [
    ...new Set(
      SEARCH_RELEVANCE_CASES.flatMap((evaluationCase) =>
        evaluationCase.judgments.map((judgment) => judgment.tmdbId),
      ),
    ),
  ];
  const { data, error } = await supabase
    .from("movies")
    .select(
      "id,tmdb_id,title,original_title,overview,genres,emotional_tags,emotional_scores,vote_average,popularity",
    )
    .in("tmdb_id", ids);
  if (error) throw error;
  const movieByTmdbId = new Map(
    ((data ?? []) as EvaluationRow[]).map((row) => [
      row.tmdb_id,
      mapMovie(row),
    ]),
  );
  const results: Record<string, unknown> = {};
  let failed = false;

  for (const evaluationCase of SEARCH_RELEVANCE_CASES) {
    const judgmentById = new Map<number, string>(
      evaluationCase.judgments.map(
        (judgment) => [judgment.tmdbId, judgment.label] as [number, string],
      ),
    );
    const candidates = evaluationCase.judgments
      .map((judgment) => movieByTmdbId.get(judgment.tmdbId))
      .filter((movie): movie is Movie => Boolean(movie));
    const ranked = rankSearchBatchesWithScores(
      [
        {
          query: { text: "", weight: 0, source: "fallback" },
          movies: candidates,
        },
      ],
      analyzeSearchQuery(evaluationCase.query),
    ).slice(0, 10);
    const relevant = ranked.filter(
      ({ movie }) => judgmentById.get(movie.tmdbId ?? -1) === "relevant",
    ).length;
    const precisionAt10 = Number((relevant / 10).toFixed(2));
    const previous = baseline[evaluationCase.id];
    const passes =
      candidates.length === evaluationCase.judgments.length &&
      precisionAt10 >= previous - 0.05 &&
      (evaluationCase.id !== "cry" || precisionAt10 >= 0.8);
    if (!passes) failed = true;
    results[evaluationCase.id] = {
      query: evaluationCase.query,
      precisionAt10,
      baseline: previous,
      judgedMoviesFound: candidates.length,
      expectedMovies: evaluationCase.judgments.length,
      passes,
      top10: ranked.map(({ movie, reasons }) => ({
        tmdbId: movie.tmdbId,
        title: movie.title,
        label: judgmentById.get(movie.tmdbId ?? -1),
        reasons,
      })),
    };
  }

  console.log(JSON.stringify(results, null, 2));
  if (failed) process.exitCode = 1;
}

void main();
