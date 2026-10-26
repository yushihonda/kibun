import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentPreviewList } from "@/features/community/comment-preview-list";
import { NewThreadForm } from "@/features/community/comment-section";
import { CommunityShell } from "@/features/community/community-shell";
import { loadComments } from "@/lib/community/comments";
import { createClient } from "@/lib/supabase/server";

async function loadBoard(slug: string) {
  const supabase = await createClient();
  if (!supabase || !/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const { data } = await supabase
    .from("community_boards")
    .select("slug,name,description")
    .eq("slug", slug)
    .maybeSingle();
  return data ? { supabase, board: data } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ board: string }>;
}): Promise<Metadata> {
  const { board } = await params;
  const loaded = await loadBoard(board);
  return {
    title: loaded ? `${loaded.board.name} | コミュニティ` : "コミュニティ",
  };
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ board: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const [{ board: slug }, { sort }] = await Promise.all([params, searchParams]);
  const loaded = await loadBoard(slug);
  if (!loaded) notFound();
  const { supabase, board } = loaded;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const threadSort = sort === "top" ? "top" : "new";
  const threads = await loadComments(supabase, {
    board: board.slug,
    sort: threadSort,
    limit: 50,
    viewerId: user?.id ?? null,
    includeReplies: false,
  }).catch(() => []);

  return (
    <CommunityShell back={{ href: "/community", label: "コミュニティ" }}>
      <h1 className="text-3xl font-black">{board.name}</h1>
      <p className="mt-2 text-sm text-white/75">{board.description}</p>

      <details className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <summary className="cursor-pointer text-sm font-black text-lime-300">
          ＋ スレッドを立てる
        </summary>
        <div className="mt-4">
          <NewThreadForm board={board.slug} />
        </div>
      </details>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-xl font-black">スレッド</h2>
        <nav className="flex rounded-full bg-white/5 p-1 text-xs font-bold">
          {(
            [
              ["new", "新着"],
              ["top", "人気"],
            ] as const
          ).map(([value, label]) => (
            <a
              key={value}
              href={`/community/${board.slug}${value === "top" ? "?sort=top" : ""}`}
              aria-current={threadSort === value ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${threadSort === value ? "bg-white text-zinc-950" : "text-white/75"}`}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="mt-4">
        <CommentPreviewList
          comments={threads}
          boardNames={{ [board.slug]: board.name }}
          empty="まだスレッドはありません。最初のスレッドを立ててみましょう。"
        />
      </div>
    </CommunityShell>
  );
}
