import Link from "next/link";
import { safeNextPath } from "@/lib/auth/next-path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { signInWithGoogle, signInWithMagicLink } from "./actions";

const messages: Record<string, string> = {
  config: "Supabaseの環境変数が未設定です。",
  oauth: "Googleログインを開始できませんでした。",
  email: "有効なメールアドレスを入力してください。",
  magic: "マジックリンクを送信できませんでした。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : "/",
  );
  const error =
    typeof params.error === "string" ? messages[params.error] : null;
  const sent = params.status === "sent";
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f1e8] px-5 pb-24 text-zinc-950">
      <section className="w-full max-w-md rounded-[2rem] border border-black/10 bg-white p-7 shadow-xl">
        <Link href="/" className="text-sm font-black tracking-[0.2em]">
          KIBUN
        </Link>
        <h1 className="mt-6 text-3xl font-black">ログイン</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          見た・見たい・お気に入り・評価を端末をまたいで保存します。
        </p>

        {(error || !configured) && (
          <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {error ??
              "Supabaseの環境変数が未設定です。デモ表示は引き続き利用できます。"}
          </p>
        )}
        {sent && (
          <p className="mt-5 rounded-xl bg-lime-100 p-3 text-sm font-medium">
            ログイン用リンクを送信しました。メールを確認してください。
          </p>
        )}

        <form action={signInWithGoogle} className="mt-6">
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            disabled={!configured}
            className="w-full rounded-full bg-zinc-950 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Googleで続ける
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-black/10" />
          または
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <form action={signInWithMagicLink} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block text-xs font-bold" htmlFor="email">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-black/15 px-4 py-3 outline-none focus:ring-2 focus:ring-lime-500"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={!configured}
            className="w-full rounded-full bg-lime-300 px-5 py-3 font-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            マジックリンクを送る
          </button>
        </form>
      </section>
    </main>
  );
}
