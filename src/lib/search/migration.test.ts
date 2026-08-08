import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0001_initial.sql"),
  "utf8",
).toLowerCase();
const originSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608040005_movie_origin_search.sql",
  ),
  "utf8",
).toLowerCase();
const originFilterSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608040006_search_origin_filter.sql",
  ),
  "utf8",
).toLowerCase();
const regionalQualitySql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608040007_regional_search_quality.sql",
  ),
  "utf8",
).toLowerCase();
const editorialPicksSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608060001_editorial_picks.sql",
  ),
  "utf8",
).toLowerCase();
const movieAndTvSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608070006_movie_and_tv.sql"),
  "utf8",
).toLowerCase();
const tiktokFuzzySearchSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608080003_tiktok_fuzzy_search.sql",
  ),
  "utf8",
).toLowerCase();

describe("initial Supabase migration", () => {
  it("enables local Japanese and fuzzy search extensions", () => {
    expect(sql).toContain("create extension if not exists pgroonga");
    expect(sql).toContain("create extension if not exists pg_trgm");
    expect(sql).toContain("using pgroonga");
    expect(sql).toContain("gin_trgm_ops");
  });

  it("enables RLS on every public table", () => {
    for (const table of [
      "profiles",
      "movies",
      "providers",
      "movie_providers",
      "movie_videos",
      "user_movie_interactions",
      "reviews",
      "search_events",
      "sync_runs",
    ]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("locks down the search RPC and supports all required filters", () => {
    expect(sql).toContain("create or replace function public.search_movies");
    expect(sql).toContain("set search_path = public, extensions");
    expect(sql).toContain("p_provider_slugs");
    expect(sql).toContain("p_offer_types");
    expect(sql).toContain("p_max_runtime");
    expect(sql).toContain("p_min_rating");
    expect(sql).toContain("p_tags");
    expect(sql).toContain("p_exclude_watched");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("revoke all on function public.search_movies");
  });
});

describe("movie origin search migration", () => {
  it("stores and indexes language and production countries", () => {
    expect(originSql).toContain("original_language text");
    expect(originSql).toContain("origin_countries text[]");
    expect(originSql).toContain("movies_original_language_idx");
    expect(originSql).toContain("movies_origin_countries_idx");
  });

  it("adds Japanese and Korean aliases to full-text search", () => {
    expect(originSql).toContain("邦画 日本映画 日本作品");
    expect(originSql).toContain("韓国映画 韓流 韓国作品 k-movie");
    expect(originSql).toContain("original_language,");
    expect(originSql).toContain("origin_countries");
  });

  it("filters the search RPC by production country", () => {
    expect(originFilterSql).toContain("p_origin_countries text[]");
    expect(originFilterSql).toContain(
      "m.origin_countries && s.origin_countries",
    );
    expect(originFilterSql).toContain("security definer");
  });

  it("supports a minimum vote-count quality gate", () => {
    expect(regionalQualitySql).toContain("p_min_vote_count integer");
    expect(regionalQualitySql).toContain("m.vote_count >= least");
  });
});

describe("editorial picks migration", () => {
  it("creates a unique movie curation table with update tracking", () => {
    expect(editorialPicksSql).toContain(
      "create table if not exists public.editorial_picks",
    );
    expect(editorialPicksSql).toContain("unique (movie_id)");
    expect(editorialPicksSql).toContain("editorial_picks_updated_at");
  });

  it("allows public featured reads and restricts writes to authenticated admins", () => {
    expect(editorialPicksSql).toContain(
      "alter table public.editorial_picks enable row level security",
    );
    expect(editorialPicksSql).toContain(
      "for select to anon, authenticated using (is_featured = true)",
    );
    expect(editorialPicksSql).toContain("for all to authenticated");
    expect(editorialPicksSql).toContain(
      "using (public.is_admin()) with check (public.is_admin())",
    );
  });
});

describe("movie and TV catalog migration", () => {
  it("separates TMDB IDs by media type without losing existing films", () => {
    expect(movieAndTvSql).toContain("media_type text not null default 'movie'");
    expect(movieAndTvSql).toContain("check (media_type in ('movie', 'tv'))");
    expect(movieAndTvSql).toContain("(media_type, tmdb_id)");
    expect(movieAndTvSql).toContain("number_of_seasons");
    expect(movieAndTvSql).toContain("number_of_episodes");
  });

  it("returns and filters media types through the search RPC", () => {
    expect(movieAndTvSql).toContain("p_media_types text[]");
    expect(movieAndTvSql).toContain("m.media_type = any(s.media_types)");
    expect(movieAndTvSql).toContain("case new.media_type");
    expect(movieAndTvSql).toContain("then 'ドラマ tv シリーズ'");
  });

  it("looks up provider updates with the composite TMDB identity", () => {
    expect(movieAndTvSql).toContain("p_media_type text default 'movie'");
    expect(movieAndTvSql).toContain("and media_type = p_media_type");
  });
});

describe("TikTok fuzzy search migration", () => {
  it("uses only fresh aggregate hashtag and topic signals as candidates", () => {
    expect(tiktokFuzzySearchSql).toContain(
      "from public.movie_social_signals ms",
    );
    expect(tiktokFuzzySearchSql).toContain("unnest(ms.top_hashtags)");
    expect(tiktokFuzzySearchSql).toContain("unnest(ms.topics)");
    expect(tiktokFuzzySearchSql).toContain("interval '120 days'");
    expect(tiktokFuzzySearchSql).not.toContain("movie_social_posts");
  });

  it("supports exact, containment and capped trigram matching", () => {
    expect(tiktokFuzzySearchSql).toContain(
      "normalized.normalized_term = s.normalized_query",
    );
    expect(tiktokFuzzySearchSql).toContain(
      "similarity(normalized.normalized_term, s.normalized_query) >= 0.40",
    );
    expect(tiktokFuzzySearchSql).toContain("coalesce(sm.match_score, 0)");
    expect(tiktokFuzzySearchSql).toContain("or sm.movie_id is not null");
  });

  it("blocks generic social tags from expanding search", () => {
    for (const tag of ["'fyp'", "'おすすめ'", "'映画'", "'ドラマ'"]) {
      expect(tiktokFuzzySearchSql).toContain(tag);
    }
  });

  it("preserves media, provider and watched filters", () => {
    expect(tiktokFuzzySearchSql).toContain("m.media_type = any(s.media_types)");
    expect(tiktokFuzzySearchSql).toContain("pr.slug = any(s.provider_slugs)");
    expect(tiktokFuzzySearchSql).toContain("umi.status = 'watched'");
  });
});
