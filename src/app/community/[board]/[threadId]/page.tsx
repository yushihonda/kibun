import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentSection } from "@/features/community/comment-section";
import { CommunityShell } from "@/features/community/community-shell";
import { loadComments } from "@/lib/community/comments";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadThread(board: string, threadId: string) {
  const supabase = await createClient();
  if (!supabase || !UUID.test(threadId)) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;
  const [comments, { data: boardRow }] = await Promise.all([
    loadComments(supabase, { rootId: threadId, viewerId }).catch(() => []),
    supabase
      .from("community_boards")
      .select("slug,name")
      .eq("slug", board)
      .maybeSingle(),
  ]);
  const root = comments[0];
  if (!root || !boardRow || root.board !== boardRow.slug) return null;
  return { comments, root, board: boardRow };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ board: string; threadId: string }>;
}): Promise<Metadata> {
  const { board, threadId } = await params;
  const thread = await loadThread(board, threadId);
  return { title: thread?.root.title ?? "スレッド" };
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ board: string; threadId: string }>;
}) {
  const { board, threadId } = await params;
  const thread = await loadThread(board, threadId);
  if (!thread) notFound();

  return (
    <CommunityShell
      back={{
        href: `/community/${thread.board.slug}`,
        label: thread.board.name,
      }}
    >
      <p className="text-xs font-bold text-lime-300">{thread.board.name}</p>
      <h1 className="mt-1 text-2xl font-black">
        {thread.root.deleted ? "削除されたスレッド" : thread.root.title}
      </h1>
      <div className="mt-5">
        <CommentSection
          target={{ rootId: thread.root.id }}
          initialComments={thread.comments}
        />
      </div>
    </CommunityShell>
  );
}
