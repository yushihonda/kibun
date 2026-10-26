import type { SupabaseClient } from "@supabase/supabase-js";

export type CommentSort = "new" | "top";

export type CommunityAuthor = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CommunityComment = {
  id: string;
  author: CommunityAuthor;
  movie: { id: string; title: string; posterUrl: string | null } | null;
  board: string | null;
  parentId: string | null;
  title: string | null;
  body: string;
  isSpoiler: boolean;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  isMine: boolean;
  deleted: boolean;
  hidden: boolean;
  edited: boolean;
  createdAt: string;
  replies: CommunityComment[];
};

export type CommentRow = {
  id: string;
  user_id: string;
  movie_id: string | null;
  board: string | null;
  parent_id: string | null;
  title: string | null;
  body: string;
  is_spoiler: boolean;
  like_count: number;
  reply_count: number;
  deleted_at: string | null;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
  movie?:
    | { id: string; title: string; poster_path: string | null }
    | { id: string; title: string; poster_path: string | null }[]
    | null;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export const ANONYMOUS_NAME = "名無しさん";

const COMMENT_FIELDS =
  "id,user_id,movie_id,board,parent_id,title,body,is_spoiler,like_count,reply_count,deleted_at,hidden_at,created_at,updated_at,movie:movies(id,title,poster_path)";

export function toAuthor(
  userId: string,
  profile: ProfileRow | undefined,
): CommunityAuthor {
  return {
    id: userId,
    displayName: profile?.display_name?.trim() || ANONYMOUS_NAME,
    avatarUrl: profile?.avatar_url ?? null,
  };
}

// Edits within a minute of posting are treated as part of the original post.
const EDIT_GRACE_MS = 60_000;

export function buildCommentTree(
  rows: CommentRow[],
  options: {
    profiles: Map<string, ProfileRow>;
    likedIds: Set<string>;
    blockedIds: Set<string>;
    viewerId: string | null;
    flat?: boolean;
  },
): CommunityComment[] {
  const toComment = (row: CommentRow): CommunityComment => {
    const movie = Array.isArray(row.movie) ? row.movie[0] : row.movie;
    const deleted = row.deleted_at !== null;
    const hidden = row.hidden_at !== null;
    return {
      id: row.id,
      author: deleted
        ? { id: "", displayName: "削除済み", avatarUrl: null }
        : toAuthor(row.user_id, options.profiles.get(row.user_id)),
      movie: movie
        ? {
            id: movie.id,
            title: movie.title,
            posterUrl: movie.poster_path
              ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
              : null,
          }
        : null,
      board: row.board,
      parentId: row.parent_id,
      title: row.title,
      body: deleted ? "" : row.body,
      isSpoiler: row.is_spoiler,
      likeCount: row.like_count,
      replyCount: row.reply_count,
      likedByMe: options.likedIds.has(row.id),
      isMine: !deleted && row.user_id === options.viewerId,
      deleted,
      hidden,
      edited:
        Date.parse(row.updated_at) - Date.parse(row.created_at) > EDIT_GRACE_MS,
      createdAt: row.created_at,
      replies: [],
    };
  };

  const visible = rows.filter(
    (row) =>
      !options.blockedIds.has(row.user_id) &&
      (row.hidden_at === null || row.user_id === options.viewerId),
  );
  if (options.flat) {
    return visible.filter((row) => row.deleted_at === null).map(toComment);
  }

  const roots = visible.filter((row) => row.parent_id === null);
  const repliesByParent = new Map<string, CommunityComment[]>();
  for (const row of visible) {
    if (row.parent_id === null || row.deleted_at !== null) continue;
    const list = repliesByParent.get(row.parent_id) ?? [];
    list.push(toComment(row));
    repliesByParent.set(row.parent_id, list);
  }
  return roots.flatMap((row) => {
    const replies = (repliesByParent.get(row.id) ?? []).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    // A deleted root only stays as a placeholder while it still has replies.
    if (row.deleted_at !== null && replies.length === 0) return [];
    return [{ ...toComment(row), replies }];
  });
}

export async function loadComments(
  supabase: SupabaseClient,
  options: {
    movieId?: string;
    board?: string;
    rootId?: string;
    userIds?: string[];
    scope?: "boards" | "movies";
    sort?: CommentSort;
    limit?: number;
    viewerId: string | null;
    includeReplies?: boolean;
  },
): Promise<CommunityComment[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const flat = Boolean(options.userIds);
  let query = supabase.from("comments").select(COMMENT_FIELDS).limit(limit);
  if (options.rootId) query = query.eq("id", options.rootId);
  if (options.movieId) query = query.eq("movie_id", options.movieId);
  if (options.board) query = query.eq("board", options.board);
  if (options.scope === "boards") query = query.not("board", "is", null);
  if (options.scope === "movies") query = query.not("movie_id", "is", null);
  if (options.userIds) {
    if (!options.userIds.length) return [];
    query = query.in("user_id", options.userIds).is("deleted_at", null);
  } else {
    query = query.is("parent_id", null);
  }
  if (options.sort === "top") {
    query = query.order("like_count", { ascending: false });
  }
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  const roots = (data ?? []) as unknown as CommentRow[];

  let replies: CommentRow[] = [];
  if (!flat && options.includeReplies !== false && roots.length) {
    const { data: replyData, error: replyError } = await supabase
      .from("comments")
      .select(COMMENT_FIELDS)
      .in(
        "parent_id",
        roots.map((row) => row.id),
      )
      .order("created_at", { ascending: true })
      .limit(500);
    if (replyError) throw replyError;
    replies = (replyData ?? []) as unknown as CommentRow[];
  }

  const rows = [...roots, ...replies];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const commentIds = rows.map((row) => row.id);
  const [profiles, likes, blocks] = await Promise.all([
    userIds.length
      ? supabase
          .from("public_profiles")
          .select("id,display_name,avatar_url")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    options.viewerId && commentIds.length
      ? supabase
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", options.viewerId)
          .in("comment_id", commentIds)
      : Promise.resolve({ data: [] }),
    options.viewerId
      ? supabase
          .from("user_blocks")
          .select("blocked_id")
          .eq("blocker_id", options.viewerId)
      : Promise.resolve({ data: [] }),
  ]);

  return buildCommentTree(rows, {
    profiles: new Map(
      ((profiles.data ?? []) as ProfileRow[]).map((profile) => [
        profile.id,
        profile,
      ]),
    ),
    likedIds: new Set(
      ((likes.data ?? []) as { comment_id: string }[]).map(
        (like) => like.comment_id,
      ),
    ),
    blockedIds: new Set(
      ((blocks.data ?? []) as { blocked_id: string }[]).map(
        (block) => block.blocked_id,
      ),
    ),
    viewerId: options.viewerId,
    flat,
  });
}

export type CommunityBoard = {
  slug: string;
  name: string;
  description: string;
};

export async function loadBoards(
  supabase: SupabaseClient,
): Promise<CommunityBoard[]> {
  const { data, error } = await supabase
    .from("community_boards")
    .select("slug,name,description")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityBoard[];
}
