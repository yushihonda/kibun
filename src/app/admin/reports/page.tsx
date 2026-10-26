import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ReportActions } from "@/features/admin/report-actions";
import { requireAdmin } from "@/lib/auth/admin";
import { ANONYMOUS_NAME } from "@/lib/community/comments";
import { createClient } from "@/lib/supabase/server";

const REASON_LABELS: Record<string, string> = {
  spoiler: "ネタバレ",
  harassment: "誹謗中傷",
  spam: "スパム",
  inappropriate: "不適切",
  other: "その他",
};

type ReportRow = {
  id: string;
  reason: string;
  detail: string | null;
  created_at: string;
  comment: {
    id: string;
    user_id: string;
    title: string | null;
    body: string;
    hidden_at: string | null;
    movie_id: string | null;
    board: string | null;
    parent_id: string | null;
  } | null;
};

export default async function AdminReportsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?next=/admin/reports");
  const auth = await requireAdmin(supabase);
  if (auth.error) redirect("/login?next=/admin/reports");

  const { data } = await supabase
    .from("comment_reports")
    .select(
      "id,reason,detail,created_at,comment:comments(id,user_id,title,body,hidden_at,movie_id,board,parent_id)",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  const reports = (data ?? []) as unknown as ReportRow[];
  const authorIds = [
    ...new Set(reports.flatMap((report) => report.comment?.user_id ?? [])),
  ];
  const { data: authors } = authorIds.length
    ? await supabase
        .from("public_profiles")
        .select("id,display_name")
        .in("id", authorIds)
    : { data: [] };
  const authorNames = new Map(
    (authors ?? []).map(
      (author: { id: string; display_name: string | null }) => [
        author.id,
        author.display_name?.trim() || ANONYMOUS_NAME,
      ],
    ),
  );
  // Several people can report one comment; show it once with every reason.
  const byComment = new Map<string, ReportRow[]>();
  for (const report of reports) {
    if (!report.comment) continue;
    const list = byComment.get(report.comment.id) ?? [];
    list.push(report);
    byComment.set(report.comment.id, list);
  }

  return (
    <main className="min-h-dvh bg-zinc-950 px-5 pb-28 text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between py-6">
        <Brand />
        <nav className="flex gap-3 text-xs font-bold">
          <Link href="/admin/titles" className="text-white/50">
            作品
          </Link>
          <Link href="/admin/videos" className="text-white/50">
            動画
          </Link>
          <Link href="/admin/picks" className="text-white/50">
            編集部
          </Link>
          <Link href="/admin/reports" className="text-lime-300">
            通報
          </Link>
          <Link href="/admin/operations" className="text-white/50">
            運用
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-bold tracking-[0.2em] text-lime-300">
          ADMIN
        </p>
        <h1 className="mt-2 text-3xl font-black">通報の確認</h1>
        <p className="mt-2 text-sm text-white/70">
          未対応の通報 {byComment.size}
          件。非表示にした投稿は投稿者本人と管理者だけが見られます。
        </p>
        <ul className="mt-7 space-y-3">
          {[...byComment.values()].map((group) => {
            const comment = group[0].comment!;
            const location = comment.board
              ? `/community/${comment.board}/${comment.parent_id ?? comment.id}`
              : null;
            return (
              <li
                key={comment.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {group.map((report) => (
                    <span
                      key={report.id}
                      className="rounded-full bg-rose-400/20 px-2.5 py-1 font-bold text-rose-200"
                    >
                      {REASON_LABELS[report.reason] ?? report.reason}
                    </span>
                  ))}
                  <span className="text-white/60">
                    {group[0].created_at.slice(0, 16).replace("T", " ")}
                  </span>
                  {comment.hidden_at && (
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/80">
                      非表示中
                    </span>
                  )}
                </div>
                <p className="mt-3 text-xs text-white/70">
                  投稿者:{" "}
                  <Link
                    href={`/u/${comment.user_id}`}
                    className="font-bold text-white hover:underline"
                  >
                    {authorNames.get(comment.user_id) ?? ANONYMOUS_NAME}
                  </Link>
                  {location && (
                    <>
                      {" "}
                      ・{" "}
                      <Link
                        href={location}
                        className="text-lime-300 hover:underline"
                      >
                        スレッドを開く
                      </Link>
                    </>
                  )}
                </p>
                {comment.title && (
                  <p className="mt-2 font-black">{comment.title}</p>
                )}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-white/90">
                  {comment.body}
                </p>
                {group.some((report) => report.detail) && (
                  <ul className="mt-2 space-y-1 text-xs text-white/70">
                    {group.flatMap((report) =>
                      report.detail ? (
                        <li key={report.id}>「{report.detail}」</li>
                      ) : (
                        []
                      ),
                    )}
                  </ul>
                )}
                <div className="mt-4">
                  <ReportActions
                    reportId={group[0].id}
                    hidden={Boolean(comment.hidden_at)}
                  />
                </div>
              </li>
            );
          })}
          {byComment.size === 0 && (
            <li className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-sm text-white/70">
              未対応の通報はありません。
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}
