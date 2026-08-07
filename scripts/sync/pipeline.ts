import { buildEmotionProfile, generateEmotionTags } from "./emotions.js";
import { mapJapaneseProviders, mapTmdbMovie } from "./mapping.js";
import { SyncStore } from "./supabase.js";
import { pageLimit, TmdbClient } from "./tmdb.js";
import { isRetryableHttpError, withRetry } from "./retry.js";
import {
  TMDB_MEDIA_TYPES,
  TMDB_SOURCES,
  type MediaType,
  type SyncFailure,
  type TmdbSource,
} from "./types.js";

export interface SyncConfig {
  tmdbToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openAiApiKey?: string;
  openAiModel?: string;
  maxPages?: string;
  concurrency: number;
  sources: TmdbSource[];
  mediaTypes: MediaType[];
  refreshTracked: boolean;
  emotionAiMaxMovies: number;
  emotionAiMaxCostUsd: number;
}

const ESTIMATED_AI_COST_PER_MOVIE_USD = 0.0003;

const knownSources = new Set<string>(TMDB_SOURCES);
const knownMediaTypes = new Set<string>(TMDB_MEDIA_TYPES);

export function parseSources(value: string | undefined): TmdbSource[] {
  const requested = (value ?? "")
    .split(",")
    .map((source) => source.trim().toLowerCase())
    .filter(Boolean);
  if (!requested.length) return [...TMDB_SOURCES];

  const invalid = requested.filter((source) => !knownSources.has(source));
  if (invalid.length) {
    throw new Error(`Unknown SYNC_SOURCES: ${invalid.join(", ")}`);
  }
  return [...new Set(requested)] as TmdbSource[];
}

export function parseMediaTypes(value: string | undefined): MediaType[] {
  const requested = (value ?? "")
    .split(",")
    .map((mediaType) => mediaType.trim().toLowerCase())
    .filter(Boolean);
  if (!requested.length) return [...TMDB_MEDIA_TYPES];

  const invalid = requested.filter(
    (mediaType) => !knownMediaTypes.has(mediaType),
  );
  if (invalid.length) {
    throw new Error(`Unknown SYNC_MEDIA_TYPES: ${invalid.join(", ")}`);
  }
  return [...new Set(requested)] as MediaType[];
}

export async function runSync(config: SyncConfig): Promise<{
  failures: SyncFailure[];
  discovered: number;
  succeeded: number;
  indexed: number;
  aiEnriched: number;
  aiEstimatedCostUsd: number;
}> {
  const tmdb = new TmdbClient(config.tmdbToken);
  const store = new SyncStore(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
  );
  const failures: SyncFailure[] = [];
  const discovered = new Map<
    string,
    { tmdbId: number; mediaType: MediaType; sources: Set<TmdbSource> }
  >();
  const runId = await store.startRun();
  let succeeded = 0;
  let aiEnriched = 0;
  let aiEstimatedCostUsd = 0;

  try {
    const trackedMovies = new Map<
      string,
      { tmdbId: number; mediaType: MediaType; sources: Set<TmdbSource> }
    >();
    try {
      for (const tracked of await store.listTrackedMovies()) {
        const validSources = tracked.sources.filter(
          (source): source is TmdbSource =>
            knownSources.has(source) && source !== "trending",
        );
        const key = mediaKey(tracked.mediaType, tracked.tmdbId);
        const metadata = {
          tmdbId: tracked.tmdbId,
          mediaType: tracked.mediaType,
          sources: new Set(validSources),
        };
        trackedMovies.set(key, metadata);
        if (config.refreshTracked) {
          discovered.set(key, {
            tmdbId: tracked.tmdbId,
            mediaType: tracked.mediaType,
            sources: new Set(metadata.sources),
          });
        }
      }
    } catch (error) {
      failures.push({ message: errorMessage(error, "tracked movies") });
    }

    for (const mediaType of config.mediaTypes) {
      for (const source of config.sources) {
        try {
          const first = await tmdb.list(source, 1, mediaType);
          mergeMovies(discovered, first.results, source, mediaType);
          const limit = pageLimit(first.total_pages, config.maxPages);
          for (let page = 2; page <= limit; page += 1) {
            try {
              mergeMovies(
                discovered,
                (await tmdb.list(source, page, mediaType)).results,
                source,
                mediaType,
              );
            } catch (error) {
              failures.push({
                mediaType,
                source,
                message: errorMessage(error, `page ${page}`),
              });
            }
          }
        } catch (error) {
          failures.push({
            mediaType,
            source,
            message: errorMessage(error, "first page"),
          });
        }
      }
    }

    for (const [key, metadata] of discovered) {
      const tracked = trackedMovies.get(key);
      if (!tracked) continue;
      for (const source of tracked.sources) metadata.sources.add(source);
    }

    await mapLimit(
      [...discovered.entries()],
      config.concurrency,
      async (item) => {
        const [, metadata] = item;
        const { tmdbId, mediaType } = metadata;
        try {
          const [details, existing] = await Promise.all([
            tmdb.details(tmdbId, mediaType),
            withRetry(() => store.existingMovieMeta(mediaType, tmdbId), {
              attempts: 4,
              shouldRetry: isRetryableHttpError,
            }),
          ]);
          const canUseAi =
            Boolean(config.openAiApiKey) &&
            aiEnriched < config.emotionAiMaxMovies &&
            aiEstimatedCostUsd + ESTIMATED_AI_COST_PER_MOVIE_USD <=
              config.emotionAiMaxCostUsd;
          let aiTags: Awaited<ReturnType<typeof generateEmotionTags>> = [];
          if (canUseAi) {
            try {
              aiTags = await generateEmotionTags(
                details,
                config.openAiApiKey,
                config.openAiModel,
              );
              aiEnriched += 1;
              aiEstimatedCostUsd += ESTIMATED_AI_COST_PER_MOVIE_USD;
            } catch (error) {
              console.warn(
                `Emotion AI skipped for TMDB ${mediaType}/${tmdbId}: ${errorMessage(error)}`,
              );
            }
          }
          const emotionProfile = buildEmotionProfile(details, {
            existingScores: existing.emotionScores,
            databaseOverrides: existing.emotionOverrides,
            aiTags: aiTags.length ? aiTags : existing.emotionTags,
          });
          const syncedAt = new Date().toISOString();
          const movie = mapTmdbMovie(
            details,
            [...metadata.sources],
            emotionProfile,
            syncedAt,
          );
          const providers = mapJapaneseProviders(details, syncedAt);
          await withRetry(() => store.upsertMovie(movie), {
            attempts: 4,
            shouldRetry: isRetryableHttpError,
          });
          await Promise.all([
            withRetry(
              () =>
                store.replaceProviders(mediaType, tmdbId, providers, syncedAt),
              { attempts: 4, shouldRetry: isRetryableHttpError },
            ),
            withRetry(
              () =>
                store.syncYouTubeVideo(
                  mediaType,
                  tmdbId,
                  movie.youtube_video_key,
                ),
              { attempts: 4, shouldRetry: isRetryableHttpError },
            ),
          ]);
          succeeded += 1;
        } catch (error) {
          failures.push({ mediaType, tmdbId, message: errorMessage(error) });
        }
      },
    );
  } finally {
    await store.finishRun(
      runId,
      failures.length === 0 ? "succeeded" : "failed",
      {
        discovered: discovered.size,
        succeeded,
        failed: failures.length,
      },
      failures,
    );
  }

  return {
    failures,
    discovered: discovered.size,
    succeeded,
    indexed: succeeded,
    aiEnriched,
    aiEstimatedCostUsd: Number(aiEstimatedCostUsd.toFixed(4)),
  };
}

function mergeMovies(
  target: Map<
    string,
    { tmdbId: number; mediaType: MediaType; sources: Set<TmdbSource> }
  >,
  movies: Array<{ id: number }>,
  source: TmdbSource,
  mediaType: MediaType,
): void {
  for (const movie of movies) {
    const key = mediaKey(mediaType, movie.id);
    const current = target.get(key);
    if (current) current.sources.add(source);
    else {
      target.set(key, {
        tmdbId: movie.id,
        mediaType,
        sources: new Set([source]),
      });
    }
  }
}

function mediaKey(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}:${tmdbId}`;
}

async function mapLimit<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), queue.length) },
      async () => {
        let item: T | undefined;
        while ((item = queue.shift()) !== undefined) await worker(item);
      },
    ),
  );
}

function errorMessage(error: unknown, context?: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? JSON.stringify(error)
        : String(error);
  return context ? `${context}: ${message}` : message;
}
