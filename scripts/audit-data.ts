import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function exactCount(client: SupabaseClient, table: string) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
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
  last_synced_at: string | null;
  providers_checked_at: string | null;
};

async function allMovies(client: SupabaseClient): Promise<MovieAuditRow[]> {
  const rows: MovieAuditRow[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("movies")
      .select(
        "id,tmdb_id,media_type,title,poster_path,backdrop_path,emotional_tags,last_synced_at,providers_checked_at",
      )
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as MovieAuditRow[]));
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
    client
      .from("movie_videos")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    exactCount(client, "movie_providers"),
    exactCount(client, "reviews"),
    exactCount(client, "user_movie_interactions"),
    client
      .from("sync_runs")
      .select(
        "id,status,started_at,finished_at,discovered_count,succeeded_count,failed_count,errors",
      )
      .order("started_at", { ascending: false })
      .limit(12),
    client
      .from("provider_availability_history")
      .select("id", { count: "exact", head: true })
      .eq("is_available", false)
      .gte("checked_at", recentClosureAfter),
  ]);
  if (approvedVideos.error) throw approvedVideos.error;
  if (syncRuns.error) throw syncRuns.error;
  if (recentClosures.error) throw recentClosures.error;
  const { count: moviesWithApprovedVideos, error: videoError } = await client
    .from("movie_videos")
    .select("movie_id", { count: "exact", head: true })
    .eq("status", "approved");
  if (videoError) throw videoError;

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
      movies: movies.filter((movie) => movie.media_type === "movie").length,
      dramas: movies.filter((movie) => movie.media_type === "tv").length,
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

void main();
