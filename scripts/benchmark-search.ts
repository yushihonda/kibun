import "./load-env";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const queries = ["泣ける", "ドラマ", "コメディ", "ファミリー"];
  const results: Array<{ query: string; rows: number; durationMs: number }> =
    [];

  for (const query of queries) {
    const startedAt = performance.now();
    const { data, error } = await supabase.rpc("search_movies", {
      p_query: query,
      p_origin_countries: null,
      p_provider_slugs: null,
      p_offer_types: null,
      p_max_runtime: null,
      p_min_rating: null,
      p_min_vote_count: null,
      p_tags: null,
      p_exclude_watched: false,
      p_limit: 60,
      p_offset: 0,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    if (error) throw new Error(`${query}: ${error.code} ${error.message}`);
    results.push({ query, rows: data?.length ?? 0, durationMs });
  }

  const slowestMs = Math.max(...results.map(({ durationMs }) => durationMs));
  console.log(JSON.stringify({ results, slowestMs }, null, 2));
  if (slowestMs > 5_000) process.exitCode = 1;
}

void main();
