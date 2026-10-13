import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describeError, retrySupabaseQuery } from "./supabase-query.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function exactCount(client: SupabaseClient, table: string) {
  const { count } = await retrySupabaseQuery(`count ${table}`, () =>
    client.from(table).select("*", { count: "exact", head: true }),
  );
  return count ?? 0;
}

type MovieAuditRow = {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  emotional_tags: string[];
  original_language: string | null;
  origin_countries: string[];
  sources: string[];
  release_date: string | null;
  last_synced_at: string | null;
  providers_checked_at: string | null;
};

async function allMovies(client: SupabaseClient): Promise<MovieAuditRow[]> {
  const rows: MovieAuditRow[] = [];
  const pageSize = 1_000;
  let lastId: string | null = null;
  for (;;) {
    const { data } = await retrySupabaseQuery("load movie audit page", () => {
      let query = client
        .from("movies")
        .select(
          "id,tmdb_id,media_type,title,poster_path,backdrop_path,emotional_tags,original_language,origin_countries,sources,release_date,last_synced_at,providers_checked_at",
        )
        .order("id")
        .limit(pageSize);
      if (lastId) query = query.gt("id", lastId);
      return query;
    });
    rows.push(...((data ?? []) as MovieAuditRow[]));
    lastId = data?.at(-1)?.id ?? lastId;
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

async function main() {
  const client = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const staleBefore = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const recentClosureAfter = new Date(
    Date.now() - 31 * 86_400_000,
  ).toISOString();
  const [
    movies,
    approvedVideos,
    providerRows,
    reviews,
    interactions,
    syncRuns,
    recentClosures,
  ] = await Promise.all([
    allMovies(client),
    retrySupabaseQuery("count approved videos", () =>
      client
        .from("movie_videos")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
    ),
    exactCount(client, "movie_providers"),
    exactCount(client, "reviews"),
    exactCount(client, "user_movie_interactions"),
    retrySupabaseQuery("load recent sync runs", () =>
      client
        .from("sync_runs")
        .select(
          "id,status,started_at,finished_at,discovered_count,succeeded_count,failed_count,errors",
        )
        .order("started_at", { ascending: false })
        .limit(12),
    ),
    retrySupabaseQuery("count recent provider closures", () =>
      client
        .from("provider_availability_history")
        .select("id", { count: "exact", head: true })
        .eq("is_available", false)
        .gte("checked_at", recentClosureAfter),
    ),
  ]);
  const { count: moviesWithApprovedVideos } = await retrySupabaseQuery(
    "count movies with approved videos",
    () =>
      client
        .from("movie_videos")
        .select("movie_id", { count: "exact", head: true })
        .eq("status", "approved"),
  );

  const tmdbIds = new Set<string>();
  const duplicateTmdbIds = new Set<string>();
  for (const movie of movies) {
    const key = `${movie.media_type}:${movie.tmdb_id}`;
    if (tmdbIds.has(key)) duplicateTmdbIds.add(key);
    tmdbIds.add(key);
  }
  const missingPoster = movies.filter((movie) => !movie.poster_path);
  const missingBackdrop = movies.filter((movie) => !movie.backdrop_path);
  const missingEmotionTags = movies.filter(
    (movie) => !movie.emotional_tags?.length,
  );
  const isJapaneseTitle = (movie: MovieAuditRow) =>
    movie.sources?.includes("japan") ||
    movie.origin_countries?.includes("JP") ||
    movie.original_language === "ja";
  const catalogMovies = movies.filter((movie) => movie.media_type === "movie");
  const dramas = movies.filter((movie) => movie.media_type === "tv");
  const japaneseMovies = catalogMovies.filter(isJapaneseTitle);
  const japaneseDramas = dramas.filter(isJapaneseTitle);
  const internationalMovies = catalogMovies.filter(
    (movie) => !isJapaneseTitle(movie),
  );
  const internationalDramas = dramas.filter((movie) => !isJapaneseTitle(movie));
  const recentSince = new Date(Date.now() - 730 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const recentMovies = catalogMovies.filter(
    (movie) => movie.release_date && movie.release_date >= recentSince,
  );
  const recentDramas = dramas.filter(
    (movie) => movie.release_date && movie.release_date >= recentSince,
  );
  const recentJapaneseMovies = japaneseMovies.filter(
    (movie) => movie.release_date && movie.release_date >= recentSince,
  );
  const recentJapaneseDramas = japaneseDramas.filter(
    (movie) => movie.release_date && movie.release_date >= recentSince,
  );
  const staleProviderChecks = movies.filter(
    (movie) =>
      !movie.providers_checked_at || movie.providers_checked_at < staleBefore,
  );
  const incompleteRuns = (syncRuns.data ?? []).filter(
    (run) => run.status !== "succeeded" || Number(run.failed_count) > 0,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    thresholds: { providerStaleDays: 45 },
    totals: {
      titles: movies.length,
      movies: catalogMovies.length,
      dramas: dramas.length,
      internationalMovies: internationalMovies.length,
      internationalDramas: internationalDramas.length,
      japaneseMovies: japaneseMovies.length,
      japaneseDramas: japaneseDramas.length,
      moviesReleasedLast2Years: recentMovies.length,
      dramasReleasedLast2Years: recentDramas.length,
      japaneseMoviesReleasedLast2Years: recentJapaneseMovies.length,
      japaneseDramasReleasedLast2Years: recentJapaneseDramas.length,
      approvedVideoRows: approvedVideos.count ?? 0,
      moviesWithApprovedVideos: moviesWithApprovedVideos ?? 0,
      providerRows,
      reviews,
      interactions,
    },
    integrity: {
      duplicateTmdbIds: [...duplicateTmdbIds],
      missingPosterCount: missingPoster.length,
      missingPosterSample: missingPoster
        .slice(0, 25)
        .map((movie) => movie.tmdb_id),
      missingBackdropCount: missingBackdrop.length,
      missingBackdropSample: missingBackdrop
        .slice(0, 25)
        .map((movie) => movie.tmdb_id),
      missingEmotionTagsCount: missingEmotionTags.length,
      staleProviderCheckCount: staleProviderChecks.length,
      staleProviderCheckSample: staleProviderChecks
        .slice(0, 25)
        .map((movie) => movie.tmdb_id),
      providerClosuresLast31Days: recentClosures.count ?? 0,
    },
    coverage: {
      approvedVideoPercent: movies.length
        ? Number(
            (((moviesWithApprovedVideos ?? 0) / movies.length) * 100).toFixed(
              1,
            ),
          )
        : 0,
      posterPercent: movies.length
        ? Number(
            (
              ((movies.length - missingPoster.length) / movies.length) *
              100
            ).toFixed(1),
          )
        : 0,
      emotionTagPercent: movies.length
        ? Number(
            (
              ((movies.length - missingEmotionTags.length) / movies.length) *
              100
            ).toFixed(1),
          )
        : 0,
    },
    recentSyncRuns: syncRuns.data ?? [],
    incompleteRunCount: incompleteRuns.length,
  };

  const outputPath = resolve(
    process.env.DATA_AUDIT_OUTPUT?.trim() || ".artifacts/data-audit.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, ...report }, null, 2));
  if (duplicateTmdbIds.size > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
