import type { Metadata } from "next";
import Link from "next/link";
import { CommentPreviewList } from "@/features/community/comment-preview-list";
import { CommunityShell } from "@/features/community/community-shell";
import { loadBoards, loadComments } from "@/lib/community/comments";
import { loadCommentMovies } from "@/lib/community/movies";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "コミュニティ" };

export default async function CommunityPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <CommunityShell>
        <p className="text-sm text-white/75">
          コミュニティを使うにはSupabaseの設定が必要です。
        </p>
      </CommunityShell>
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const { data: follows } = viewerId
    ? await supabase
        .from("user_follows")
        .select("followee_id")
        .eq("follower_id", viewerId)
    : { data: [] };
  const followeeIds = (follows ?? []).map(
    (row: { followee_id: string }) => row.followee_id,
  );

  const [boards, threads, movieComments, following] = await Promise.all([
    loadBoards(supabase).catch(() => []),
    loadComments(supabase, {
      scope: "boards",
      limit: 10,
      viewerId,
      includeReplies: false,
    }).catch(() => []),
    loadComments(supabase, {
      scope: "movies",
      limit: 10,
      viewerId,
      includeReplies: false,
    }).catch(() => []),
    viewerId && followeeIds.length
      ? loadComments(supabase, {
          userIds: followeeIds,
          limit: 20,
          viewerId,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);
  const movies = await loadCommentMovies(supabase, [
    ...movieComments,
    ...following,
  ]);
  const boardNames = Object.fromEntries(
    boards.map((board) => [board.slug, board.name]),
  );

  return (
    <CommunityShell>
      <p className="text-xs font-bold tracking-[0.2em] text-lime-300">
        COMMUNITY
      </p>
      <h1 className="mt-2 text-3xl font-black">みんなで語る</h1>
      <p className="mt-2 text-sm text-white/75">
        作品の感想を書いたり、テーマごとの掲示板で話したり。ネタバレは必ず「ネタバレを含む」にチェックしてください。
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-black">掲示板</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {boards.map((board) => (
            <Link
              key={board.slug}
              href={`/community/${board.slug}`}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-lime-300/40 hover:bg-white/[0.07]"
            >
              <p className="font-black">{board.name}</p>
              <p className="mt-1 text-xs text-white/70">{board.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {viewerId && (
        <section className="mt-10">
          <h2 className="text-xl font-black">フォロー中</h2>
          <div className="mt-4">
            <CommentPreviewList
              comments={following}
              movies={movies}
              boardNames={boardNames}
              empty="気になる人をフォローすると、その人の投稿がここに並びます。"
            />
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-black">新着スレッド</h2>
        <div className="mt-4">
          <CommentPreviewList
            comments={threads}
            boardNames={boardNames}
            empty="まだスレッドはありません。掲示板から最初のスレッドを立ててみましょう。"
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black">作品への新着コメント</h2>
        <div className="mt-4">
          <CommentPreviewList
            comments={movieComments}
            movies={movies}
            empty="作品の詳細を開くと、コメントを書き込めます。"
          />
        </div>
      </section>
    </CommunityShell>
  );
}
