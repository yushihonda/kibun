import "../load-env";
import {
  parseMediaTypes,
  parseSources,
  parseSpecificItems,
  runSync,
  type SyncConfig,
} from "./pipeline.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalDate(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
  return value;
}

function configFromEnvironment(): SyncConfig {
  const concurrency = Number(process.env.SYNC_CONCURRENCY?.trim() || "5");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("SYNC_CONCURRENCY must be a positive integer");
  }
  const startPage = Number(process.env.SYNC_START_PAGE?.trim() || "1");
  if (!Number.isInteger(startPage) || startPage < 1 || startPage > 500) {
    throw new Error("SYNC_START_PAGE must be an integer from 1 to 500");
  }
  const emotionAiMaxMovies = Number(
    process.env.EMOTION_AI_MAX_MOVIES?.trim() || "0",
  );
  const emotionAiMaxCostUsd = Number(
    process.env.EMOTION_AI_MAX_COST_USD?.trim() || "0",
  );
  if (!Number.isInteger(emotionAiMaxMovies) || emotionAiMaxMovies < 0) {
    throw new Error("EMOTION_AI_MAX_MOVIES must be a non-negative integer");
  }
  if (!Number.isFinite(emotionAiMaxCostUsd) || emotionAiMaxCostUsd < 0) {
    throw new Error("EMOTION_AI_MAX_COST_USD must be a non-negative number");
  }
  return {
    tmdbToken: required("TMDB_BEARER_TOKEN"),
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    openAiApiKey: process.env.OPENAI_API_KEY?.trim(),
    openAiModel: process.env.OPENAI_MODEL?.trim(),
    maxPages: process.env.SYNC_MAX_PAGES?.trim(),
    startPage,
    concurrency,
    sources: parseSources(process.env.SYNC_SOURCES),
    mediaTypes: parseMediaTypes(process.env.SYNC_MEDIA_TYPES),
    refreshTracked:
      process.env.SYNC_REFRESH_TRACKED?.trim().toLowerCase() !== "false",
    emotionAiMaxMovies,
    emotionAiMaxCostUsd,
    runSource: process.env.SYNC_RUN_SOURCE?.trim() || undefined,
    releaseDateFrom: optionalDate("SYNC_RELEASE_DATE_FROM"),
    releaseDateTo: optionalDate("SYNC_RELEASE_DATE_TO"),
    specificItems: parseSpecificItems(process.env.SYNC_TMDB_ITEMS),
  };
}

async function main() {
  try {
    const result = await runSync(configFromEnvironment());
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}

void main();
