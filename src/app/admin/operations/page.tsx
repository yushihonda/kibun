import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOperationsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?next=/admin/operations");
  const auth = await requireAdmin(supabase);
  if (auth.error) redirect(`/login?next=/admin/operations`);
  // This route is dynamic and the time window must be evaluated for each request.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [events, feedback, syncRuns, movies, videos] = await Promise.all([
    supabase
      .from("product_events")
      .select("event_name,section_id,created_at")
      .gte("created_at", since),
    supabase
      .from("search_feedback")
      .select("is_relevant,created_at")
      .gte("created_at", since),
    supabase
      .from("sync_runs")
      .select(
        "id,status,started_at,finished_at,discovered_count,succeeded_count,failed_count",
      )
      .order("started_at", { ascending: false })
      .limit(8),
    supabase.from("movies").select("id", { count: "exact", head: true }),
    supabase
      .from("movie_videos")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
  ]);
  const eventRows = events.data ?? [];
  const counts = new Map<string, number>();
  for (const event of eventRows) {
    counts.set(event.event_name, (counts.get(event.event_name) ?? 0) + 1);
  }
  const searches =
    (counts.get("search") ?? 0) + (counts.get("zero_results") ?? 0);
  const relevantFeedback = (feedback.data ?? []).filter(
    (row) => row.is_relevant,
  ).length;
  const feedbackTotal = feedback.data?.length ?? 0;

  return (
    <main className="min-h-dvh bg-zinc-950 px-5 pb-28 text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between py-6">
        <Brand />
        <nav className="flex gap-3 text-xs font-bold">
          <Link href="/admin/videos" className="text-white/50">
            動画
          </Link>
          <Link href="/admin/picks" className="text-white/50">
            編集部
          </Link>
          <Link href="/admin/operations" className="text-lime-300">
            運用
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-bold tracking-[0.2em] text-lime-300">
          ADMIN
        </p>
        <h1 className="mt-2 text-3xl font-black">運用モニター</h1>
        <p className="mt-2 text-sm text-white/50">
          直近7日間の検索・保存・再生と同期状態です。
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["映画", movies.count ?? 0],
            ["承認済み動画", videos.count ?? 0],
            ["検索", searches],
            [
              "ゼロ件率",
              searches
                ? `${(((counts.get("zero_results") ?? 0) / searches) * 100).toFixed(1)}%`
                : "0%",
            ],
            ["作品クリック", counts.get("movie_click") ?? 0],
            ["保存", counts.get("save") ?? 0],
            ["再生開始", counts.get("playback_start") ?? 0],
            [
              "推薦一致率",
              feedbackTotal
                ? `${((relevantFeedback / feedbackTotal) * 100).toFixed(1)}%`
                : "未評価",
            ],
          ].map(([label, value]) => (
            <article
              key={label}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <p className="text-xs text-white/45">{label}</p>
              <p className="mt-2 text-2xl font-black">{value}</p>
            </article>
          ))}
        </div>
        <section className="mt-9">
          <h2 className="text-xl font-black">最近の同期</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-white/5 text-white/45">
                <tr>
                  <th className="p-3">開始</th>
                  <th>状態</th>
                  <th>発見</th>
                  <th>成功</th>
                  <th>失敗</th>
                </tr>
              </thead>
              <tbody>
                {(syncRuns.data ?? []).map((run) => (
                  <tr key={run.id} className="border-t border-white/10">
                    <td className="p-3">
                      {new Date(run.started_at).toLocaleString("ja-JP")}
                    </td>
                    <td>{run.status}</td>
                    <td>{run.discovered_count}</td>
                    <td>{run.succeeded_count}</td>
                    <td>{run.failed_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
