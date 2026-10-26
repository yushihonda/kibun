import { LogIn, LogOut, Share2 } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { MyShelf } from "@/features/me/my-shelf";
import { ProfileSettings } from "@/features/me/profile-settings";
import { PersonalizationSettings } from "@/features/me/personalization-settings";
import { loadCatalogMovies } from "@/lib/movies/catalog";
import { loadShelfItems } from "@/lib/movies/shelf";
import { loadRecommendations } from "@/lib/recommendations/server";

export default async function MyPage() {
  const supabase = await createClient();
  const userResult = supabase ? await supabase.auth.getUser() : null;
  const user = userResult?.data.user ?? null;
  const [
    shelfItems,
    { data: profile },
    { data: preference },
    movieChoices,
    recommendationResult,
  ] = user
    ? await Promise.all([
        loadShelfItems(supabase!, user.id),
        supabase!
          .from("profiles")
          .select("display_name,role,bio,shelf_public")
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
    : [
        [],
        { data: null },
        { data: null },
        [],
        { movies: [], personalized: false },
      ];
  const favoriteIds = shelfItems.flatMap((item) =>
    item.isFavorite && item.movie ? [item.movie.id] : [],
  );
  const favoriteCount = shelfItems.filter((item) => item.isFavorite).length;

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
              <p className="mt-2 text-sm text-white/75">
                {!supabase
                  ? "Supabaseを設定すると、作品棚を端末間で同期できます。"
                  : user
                    ? "見たい・見た・お気に入り・評価を保存しています。"
                    : "ログインすると、見たい・見た・評価を端末をまたいで保存できます。"}
              </p>
            </div>
            <a
              href={`/api/share?title=わたしのお気に入り${favoriteCount}選&movies=${favoriteIds.slice(0, 9).join(",")}`}
              target="_blank"
              className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-xs font-bold hover:bg-white/5"
            >
              <Share2 size={15} />
              {favoriteCount}選を画像にする
            </a>
          </div>
        </section>

        <MyShelf
          items={shelfItems}
          recommendations={user ? recommendationResult.movies : []}
          loggedIn={Boolean(user)}
        />

        {user && (
          <ProfileSettings
            userId={user.id}
            initialDisplayName={
              profile?.display_name ?? user.user_metadata?.full_name ?? ""
            }
            initialBio={profile?.bio ?? ""}
            initialShelfPublic={profile?.shelf_public === true}
          />
        )}

        {user && (
          <PersonalizationSettings
            initialEnabled={preference?.personalization_enabled !== false}
            initialGenres={preference?.preferred_genres ?? []}
            initialEmotions={preference?.preferred_emotions ?? []}
            initialFavoriteMovieIds={favoriteIds}
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
