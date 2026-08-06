import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { VideoReviewForm } from "@/features/admin/video-review-form";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminVideosPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?next=/admin/videos");
  const auth = await requireAdmin(supabase);
  if (auth.error) redirect("/login?next=/admin/videos");

  return (
    <main className="min-h-dvh bg-zinc-950 px-5 pb-28 text-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between py-6">
        <Brand />
        <nav className="flex gap-3 text-xs font-bold">
          <Link href="/admin/videos" className="text-lime-300">
            動画
          </Link>
          <Link href="/admin/picks" className="text-white/50 hover:text-white">
            編集部
          </Link>
          <Link
            href="/admin/operations"
            className="text-white/50 hover:text-white"
          >
            運用
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold tracking-[0.2em] text-lime-300">
          ADMIN
        </p>
        <h1 className="mt-2 text-3xl font-black">動画コンテンツ管理</h1>
        <p className="mt-2 text-sm text-white/50">
          URLの安全性と公開状態を確認し、映画へ紐付けます。
        </p>
        <VideoReviewForm />
      </div>
    </main>
  );
}
