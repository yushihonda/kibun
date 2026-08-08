import {
  Bookmark,
  Check,
  Heart,
  LogIn,
  LogOut,
  Share2,
  Star,
} from "lucide-react";
import { ResilientImage as Image } from "@/components/resilient-image";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { PersonalizationSettings } from "@/features/me/personalization-settings";
import { loadCatalogMovies } from "@/lib/movies/catalog";
import { loadRecommendations } from "@/lib/recommendations/server";

type ShelfRow = {
  status: "WATCHED" | "WATCHLIST" | "NONE";
  is_favorite: boolean;
  rating: number | null;
  updated_at: string;
  movie: {
    id: string;
    title: string;
    poster_path: string | null;
  } | null;
};

export default async function MyPage() {
  const supabase = await createClient();
  const userResult = supabase ? await supabase.auth.getUser() : null;
  const user = userResult?.data.user ?? null;
  const { data: shelfData } = user
    ? await supabase!
        .from("user_movie_interactions")
        .select(
          "status,is_favorite,rating,updated_at,movie:movies(id,title,poster_path)",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
    : { data: null };
  const [
    { data: profile },
    { data: preference },
    movieChoices,
    recommendationResult,
  ] = user
    ? await Promise.all([
        supabase!
          .from("profiles")
          .select("display_name,role")
          .eq("id", user.id)
          .maybeSingle(),
        supabase!
          .from("user_preferences")
          .select(
            "personalization_enabled,preferred_genres,preferred_emotions,onboarding_completed",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        loadCatalogMovies(supabase!, { limit: 12 }).catch(() => []),
        loadRecommendations(supabase!, { limit: 8, user }).catch(() => ({
          movies: [],
          personalized: false,
        })),
      ])
    : [{ data: null }, { data: null }, [], { movies: [], personalized: false }];
  const shelf = (shelfData ?? []) as unknown as ShelfRow[];
  const watched = shelf.filter((item) => item.status === "WATCHED");
  const tabs = [
    {
      label: "見たい",
      count: shelf.filter((item) => item.status === "WATCHLIST").length,
      icon: Bookmark,
    },
    { label: "見た", count: watched.length, icon: Check },
    {
      label: "お気に入り",
      count: shelf.filter((item) => item.is_favorite).length,
      icon: Heart,
    },
  ];

  return (
    <main className="min-h-dvh bg-zinc-950 pb-28 text-white">
      <header className="border-b border-white/10 px-5 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Brand />
          {user ? (
            <div className="flex items-center gap-2">
              {profile?.role === "admin" && (
                <Link
                  href="/admin/operations"
                  className="rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-zinc-950"
                >
                  管理画面
                </Link>
              )}
              <form action={signOut}>
                <button className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-bold">
                  <LogOut size={15} />
                  ログアウト
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login?next=/me"
              className="flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-zinc-950"
            >
              <LogIn size={15} />
              ログイン
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-9">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-900 p-6 md:p-9">
          <p className="text-xs font-bold tracking-[0.2em] text-lime-300">
            YOUR KIBUN
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black">
                {profile?.display_name
                  ? `${profile.display_name}さんの作品棚`
                  : user?.user_metadata?.full_name
                    ? `${user.user_metadata.full_name}さんの作品棚`
                    : "あなたの作品棚"}
              </h1>
              <p className="mt-2 text-sm text-white/55">
                {!supabase
                  ? "Supabaseを設定すると、作品棚を端末間で同期できます。"
                  : user
                    ? "見たい・見た・お気に入り・評価を保存しています。"
                    : "ログインすると、見たい・見た・評価を端末をまたいで保存できます。"}
              </p>
            </div>
            <a
              href={`/api/share?title=わたしのお気に入り${tabs[2].count}選&movies=${shelf
                .filter((item) => item.is_favorite && item.movie)
                .map((item) => item.movie!.id)
                .slice(0, 9)
                .join(",")}`}
              target="_blank"
              className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-xs font-bold hover:bg-white/5"
            >
              <Share2 size={15} />
              {tabs[2].count}選を画像にする
            </a>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {tabs.map(({ label, count, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className="rounded-2xl bg-black/25 p-4 text-left transition hover:bg-black/40"
              >
                <Icon className="text-lime-300" size={19} />
                <p className="mt-4 text-2xl font-black">{count}</p>
                <p className="text-xs text-white/50">{label}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold tracking-widest text-white/40">
                RECENTLY WATCHED
              </p>
              <h2 className="mt-1 text-xl font-black">最近観た作品</h2>
            </div>
            <button className="text-xs font-bold text-lime-300" type="button">
              すべて見る
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {watched.slice(0, 4).map((item) => (
              <article key={item.movie?.id ?? item.updated_at}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl">
                  {item.movie?.poster_path ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w780${item.movie.poster_path}`}
                      alt={`${item.movie.title} ポスター`}
                      fill
                      sizes="(max-width: 640px) 50vw, 25vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center bg-white/5 text-xs text-white/40">
                      NO IMAGE
                    </div>
                  )}
                </div>
                <h3 className="mt-2 truncate text-sm font-bold">
                  {item.movie?.title ?? "削除された映画"}
                </h3>
                <div className="mt-1 flex text-amber-300">
                  {Array.from({ length: 5 }, (_, star) => (
                    <Star
                      key={star}
                      size={12}
                      className={
                        star < (item.rating ?? 0) ? "fill-current" : ""
                      }
                    />
                  ))}
                </div>
              </article>
            ))}
            {!watched.length && (
              <p className="col-span-full rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">
                {user
                  ? "「見た」にした作品がここに並びます。"
                  : "ログインして作品棚を作りましょう。"}
              </p>
            )}
          </div>
        </section>

        {user && recommendationResult.movies.length > 0 && (
          <section className="mt-10">
            <p className="text-xs font-bold tracking-widest text-lime-300">
              FOR YOU
            </p>
            <h2 className="mt-1 text-xl font-black">あなたへのおすすめ</h2>
            <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
              {recommendationResult.movies.map((movie) => (
                <article key={movie.id} className="w-32 shrink-0">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-2xl">
                    <Image
                      src={movie.posterUrl}
                      alt={`${movie.title} ポスター`}
                      fill
                      sizes="128px"
                      className="object-cover"
                    />
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-xs font-bold">
                    {movie.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[10px] text-lime-200">
                    {movie.recommendationReason}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {user && (
          <PersonalizationSettings
            initialEnabled={preference?.personalization_enabled !== false}
            initialGenres={preference?.preferred_genres ?? []}
            initialEmotions={preference?.preferred_emotions ?? []}
            initialFavoriteMovieIds={shelf
              .filter((item) => item.is_favorite && item.movie)
              .map((item) => item.movie!.id)}
            movieChoices={movieChoices.map((movie) => ({
              id: movie.id,
              title: movie.title,
              posterUrl: movie.posterUrl,
            }))}
          />
        )}
      </div>
    </main>
  );
}
