import { buildEmotionProfile, generateEmotionTags } from "./emotions.js";
import { mapJapaneseProviders, mapTmdbMovie } from "./mapping.js";
import { SyncStore } from "./supabase.js";
import { selectSeasonTrailers } from "./youtube.js";
import { pageEnd, TmdbClient } from "./tmdb.js";
import {
  isMissingHttpResource,
  isRetryableHttpError,
  withRetry,
} from "./retry.js";
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
  startPage: number;
  concurrency: number;
  sources: TmdbSource[];
  mediaTypes: MediaType[];
  refreshTracked: boolean;
  emotionAiMaxMovies: number;
  emotionAiMaxCostUsd: number;
  runSource?: string;
  releaseDateFrom?: string;
  releaseDateTo?: string;
  specificItems: Array<{ tmdbId: number; mediaType: MediaType }>;
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

export function parseSpecificItems(
  value: string | undefined,
): Array<{ tmdbId: number; mediaType: MediaType }> {
  if (!value?.trim()) return [];
  const parsed = value.split(",").map((entry) => {
    const item = entry.trim().toLowerCase();
    const match = /^(movie|tv):(\d+)$/.exec(item);
    if (!match || Number(match[2]) < 1) {
      throw new Error(
        `Invalid SYNC_TMDB_ITEMS entry: ${item}. Use movie:123 or tv:456`,
      );
    }
    return {
      mediaType: match[1] as MediaType,
      tmdbId: Number(match[2]),
    };
  });
  return [
    ...new Map(
      parsed.map((item) => [mediaKey(item.mediaType, item.tmdbId), item]),
    ).values(),
  ];
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
  const runId = await store.startRun(config.runSource);
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
            knownSources.has(source) &&
            source !== "trending" &&
            source !== "now_playing" &&
            source !== "upcoming",
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

    if (config.specificItems.length) {
      for (const { mediaType, tmdbId } of config.specificItems) {
        discovered.set(mediaKey(mediaType, tmdbId), {
          mediaType,
          tmdbId,
          sources: new Set(config.sources),
        });
      }
    } else {
      for (const mediaType of config.mediaTypes) {
        for (const source of config.sources) {
          try {
            const listFilters = {
              releaseDateFrom: config.releaseDateFrom,
              releaseDateTo: config.releaseDateTo,
            };
            const first = await tmdb.list(
              source,
              config.startPage,
              mediaType,
              listFilters,
            );
            mergeMovies(discovered, first.results, source, mediaType);
            const limit = pageEnd(
              first.total_pages,
              config.maxPages,
              config.startPage,
            );
            for (let page = config.startPage + 1; page <= limit; page += 1) {
              try {
                mergeMovies(
                  discovered,
                  (await tmdb.list(source, page, mediaType, listFilters))
                    .results,
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
            ...selectSeasonTrailers(details).map((trailer) =>
              withRetry(
                () =>
                  store.syncYouTubeVideo(
                    mediaType,
                    tmdbId,
                    trailer.key,
                    trailer.season,
                  ),
                { attempts: 4, shouldRetry: isRetryableHttpError },
              ),
            ),
          ]);
          succeeded += 1;
        } catch (error) {
          if (isMissingHttpResource(error)) {
            console.warn(
              `TMDB ${mediaType}/${tmdbId} disappeared after discovery; skipping`,
            );
            return;
          }
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
