import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608070001_product_intelligence.sql",
  ),
  "utf8",
).toLowerCase();
const providerBackfillSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608070002_provider_history_backfill.sql",
  ),
  "utf8",
).toLowerCase();
const rlsRoleSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608070003_rls_policy_roles.sql",
  ),
  "utf8",
).toLowerCase();
const providerLookupPerformanceSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608070005_provider_lookup_performance.sql",
  ),
  "utf8",
).toLowerCase();

describe("product intelligence migration", () => {
  it("adds the recommendation, feedback and operations data model", () => {
    for (const table of [
      "movie_emotion_overrides",
      "movie_aliases",
      "provider_availability_history",
      "user_preferences",
      "product_events",
      "search_feedback",
      "support_requests",
      "api_rate_limits",
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("keeps admin and service-only data inaccessible through public table grants", () => {
    expect(sql).toContain(
      "revoke all on public.api_rate_limits from public, anon, authenticated",
    );
    expect(sql).toContain("movie_emotion_overrides_admin_all");
    expect(sql).toContain(
      "using (public.is_admin()) with check (public.is_admin())",
    );
    expect(sql).not.toContain(
      "grant select on public.movie_emotion_overrides to anon",
    );
  });

  it("allows users to delete only the currently authenticated account", () => {
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("delete from auth.users where id = v_user_id");
    expect(sql).toContain(
      "grant execute on function public.delete_own_account() to authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.delete_own_account() to anon",
    );
  });

  it("seeds provider freshness and availability history from existing data", () => {
    expect(providerBackfillSql).toContain("set providers_checked_at");
    expect(providerBackfillSql).toContain(
      "insert into public.provider_availability_history",
    );
    expect(providerBackfillSql).toContain("movie_provider.updated_at");
  });

  it("keeps admin predicates out of anonymous public-read policy evaluation", () => {
    expect(rlsRoleSql).toContain(
      "alter policy movie_videos_public_approved_read on public.movie_videos",
    );
    expect(rlsRoleSql).toContain(
      "to anon, authenticated using (status = 'approved')",
    );
    expect(rlsRoleSql).toContain(
      "alter policy movies_admin_write on public.movies\n  to authenticated",
    );
    expect(rlsRoleSql).not.toContain(
      "grant execute on function public.is_admin() to anon",
    );
  });

  it("indexes provider lookups by movie and country", () => {
    expect(providerLookupPerformanceSql).toContain(
      "on public.movie_providers (movie_id, country)",
    );
  });
});
