import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_NAME,
  buildCommentTree,
  type CommentRow,
} from "@/lib/community/comments";

const base = {
  movie_id: "m1",
  board: null,
  title: null,
  is_spoiler: false,
  like_count: 0,
  reply_count: 0,
  deleted_at: null,
  hidden_at: null,
  updated_at: "2026-10-01T00:00:00Z",
  movie: { id: "m1", title: "作品", poster_path: "/p.jpg" },
} satisfies Partial<CommentRow>;

function row(overrides: Partial<CommentRow> & { id: string }): CommentRow {
  return {
    user_id: "u1",
    parent_id: null,
    body: `body ${overrides.id}`,
    created_at: "2026-10-01T00:00:00Z",
    ...base,
    ...overrides,
  };
}

const options = (
  overrides: Partial<Parameters<typeof buildCommentTree>[1]> = {},
) => ({
  profiles: new Map([
    ["u1", { id: "u1", display_name: "ミナ", avatar_url: null }],
  ]),
  likedIds: new Set<string>(),
  blockedIds: new Set<string>(),
  viewerId: null,
  ...overrides,
});

describe("buildCommentTree", () => {
  it("nests replies under their root in posting order", () => {
    const tree = buildCommentTree(
      [
        row({ id: "root" }),
        row({
          id: "r2",
          parent_id: "root",
          created_at: "2026-10-03T00:00:00Z",
        }),
        row({
          id: "r1",
          parent_id: "root",
          created_at: "2026-10-02T00:00:00Z",
        }),
      ],
      options(),
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].replies.map((reply) => reply.id)).toEqual(["r1", "r2"]);
    expect(tree[0].author.displayName).toBe("ミナ");
    expect(tree[0].movie?.posterUrl).toContain("/p.jpg");
  });

  it("falls back to an anonymous name and marks the viewer's likes and posts", () => {
    const [comment] = buildCommentTree(
      [row({ id: "c", user_id: "u2" })],
      options({ likedIds: new Set(["c"]), viewerId: "u2" }),
    );
    expect(comment.author.displayName).toBe(ANONYMOUS_NAME);
    expect(comment.likedByMe).toBe(true);
    expect(comment.isMine).toBe(true);
  });

  it("hides blocked authors and moderated posts from other viewers", () => {
    const rows = [
      row({ id: "blocked", user_id: "bad" }),
      row({ id: "hidden", user_id: "u3", hidden_at: "2026-10-02T00:00:00Z" }),
      row({ id: "ok" }),
    ];
    expect(
      buildCommentTree(rows, options({ blockedIds: new Set(["bad"]) })).map(
        (comment) => comment.id,
      ),
    ).toEqual(["ok"]);
    expect(
      buildCommentTree(rows, options({ viewerId: "u3" })).map(
        (comment) => comment.id,
      ),
    ).toContain("hidden");
  });

  it("keeps a deleted root as a placeholder only while it has replies", () => {
    const deleted = { deleted_at: "2026-10-02T00:00:00Z" };
    const withReply = buildCommentTree(
      [
        row({ id: "root", ...deleted }),
        row({ id: "reply", parent_id: "root" }),
      ],
      options(),
    );
    expect(withReply[0].deleted).toBe(true);
    expect(withReply[0].body).toBe("");
    expect(withReply[0].isMine).toBe(false);
    expect(
      buildCommentTree([row({ id: "root", ...deleted })], options()),
    ).toEqual([]);
  });

  it("flags edits made after the grace period", () => {
    const [quick, late] = buildCommentTree(
      [
        row({ id: "quick", updated_at: "2026-10-01T00:00:30Z" }),
        row({ id: "late", updated_at: "2026-10-01T00:05:00Z" }),
      ],
      options(),
    );
    expect(quick.edited).toBe(false);
    expect(late.edited).toBe(true);
  });
});

describe("community migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/202610260001_community.sql"),
    "utf8",
  ).toLowerCase();

  it("enables row level security on every new table", () => {
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map(
      (match) => match[1],
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("keeps moderation and counters out of users' hands", () => {
    expect(sql).toContain("only administrators may moderate comments");
    expect(sql).not.toMatch(/grant update \([^)]*like_count/);
    expect(sql).not.toMatch(/grant update \([^)]*reply_count/);
  });

  it("keeps shelves private by default", () => {
    expect(sql).toContain("shelf_public boolean not null default false");
  });
});
