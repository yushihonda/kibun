import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608080001_tiktok_social_signals.sql",
  ),
  "utf8",
).toLowerCase();

describe("TikTok social signal migration", () => {
  it("adds normalized posts and title-level aggregate signals", () => {
    expect(sql).toContain("create table public.movie_social_posts");
    expect(sql).toContain("create table public.movie_social_signals");
    expect(sql).toContain("unique (movie_id, video_id)");
    expect(sql).toContain("trend_score numeric");
    expect(sql).toContain("featured_posts jsonb");
  });

  it("publishes only approved post metadata and exposes no public writes", () => {
    expect(sql).toContain(
      "create policy movie_social_posts_public_approved_read",
    );
    expect(sql).toContain("using (status = 'approved')");
    expect(sql).toContain(
      "grant select on public.movie_social_posts, public.movie_social_signals",
    );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete).*movie_social_posts/u,
    );
  });

  it("stores metadata and derived summaries, not media or comment bodies", () => {
    expect(sql).toContain(
      "media files and individual comment bodies are not stored",
    );
    expect(sql).not.toContain("video_blob");
    expect(sql).not.toContain("comment_body");
  });
});
