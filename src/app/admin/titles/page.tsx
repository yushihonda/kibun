import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { TitleImportForm } from "@/features/admin/title-import-form";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminTitlesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?next=/admin/titles");
  const auth = await requireAdmin(supabase);
  if (auth.error) redirect("/login?next=/admin/titles");

  return (
    <main className="min-h-dvh bg-zinc-950 px-5 pb-28 text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between py-6">
        <Brand />
        <nav className="flex gap-3 text-xs font-bold">
          <Link href="/admin/titles" className="text-lime-300">
            作品
          </Link>
          <Link href="/admin/picks" className="text-white/50">
            編集部
          </Link>
          <Link href="/admin/videos" className="text-white/50">
            動画
          </Link>
          <Link href="/admin/operations" className="text-white/50">
            運用
          </Link>
        </nav>
      </header>
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-bold tracking-[0.2em] text-lime-300">
          ADMIN CATALOG
        </p>
        <h1 className="mt-2 text-3xl font-black">映画・ドラマを追加</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">
          TMDBから検索し、作品情報・予告編・日本の配信先をKIBUNへ取り込みます。
        </p>
        <div className="mt-7">
          <TitleImportForm />
        </div>
      </section>
    </main>
  );
}
