import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { EditorialPicksForm } from "@/features/admin/editorial-picks-form";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPicksPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?next=/admin/picks");
  const auth = await requireAdmin(supabase);
  if (auth.error) redirect("/login?next=/admin/picks");

  return (
    <main className="min-h-dvh bg-zinc-950 px-5 pb-28 text-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between py-6">
        <Brand />
        <nav className="flex gap-3 text-xs font-bold">
          <Link href="/admin/titles" className="text-white/50">
            作品
          </Link>
          <Link href="/admin/videos" className="text-white/50 hover:text-white">
            動画
          </Link>
          <Link href="/admin/picks" className="text-lime-300">
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
        <h1 className="mt-2 text-3xl font-black">編集部のおすすめ</h1>
        <p className="mt-2 text-sm text-white/50">
          好きな作品とコメントを公開表示用に残します。ユーザー個人のお気に入りとは別枠です。
        </p>
        <EditorialPicksForm />
      </div>
    </main>
  );
}
