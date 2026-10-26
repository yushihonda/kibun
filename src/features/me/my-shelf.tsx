"use client";

import { Bookmark, Check, Heart, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  LazyMovieDetails as MovieDetails,
  usePreloadMovieDetails,
} from "@/features/feed/lazy-movie-details";
import { ResilientImage as Image } from "@/components/resilient-image";
import type { Movie } from "@/types/movie";

export type ShelfItem = {
  key: string;
  title: string;
  posterUrl: string | null;
  status: "WATCHED" | "WATCHLIST" | "NONE";
  isFavorite: boolean;
  rating: number | null;
  movie: Movie | null;
};

const TABS = [
  {
    id: "WATCHLIST",
    label: "見たい",
    icon: Bookmark,
    empty: "「見たい」にした作品がここに並びます。",
    match: (item: ShelfItem) => item.status === "WATCHLIST",
  },
  {
    id: "WATCHED",
    label: "見た",
    icon: Check,
    empty: "「見た」にした作品がここに並びます。",
    match: (item: ShelfItem) => item.status === "WATCHED",
  },
  {
    id: "FAVORITE",
    label: "お気に入り",
    icon: Heart,
    empty: "お気に入りにした作品がここに並びます。",
    match: (item: ShelfItem) => item.isFavorite,
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function MyShelf({
  items,
  recommendations,
  loggedIn,
}: {
  items: ShelfItem[];
  recommendations: Movie[];
  loggedIn: boolean;
}) {
  usePreloadMovieDetails();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(
    () => TABS.find((entry) => items.some(entry.match))?.id ?? "WATCHLIST",
  );
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const closeDetails = useCallback(() => {
    setSelectedMovie(null);
    // Pick up status, favorite, and rating changes made in the popup.
    router.refresh();
  }, [router]);

  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const visible = items.filter(activeTab.match);

  return (
    <>
      <section className="mt-6">
        <div className="grid grid-cols-3 gap-3" role="tablist">
          {TABS.map(({ id, label, icon: Icon, match }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-2xl p-4 text-left transition ${
                tab === id
                  ? "bg-lime-300 text-zinc-950"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <Icon
                className={tab === id ? "text-zinc-950" : "text-lime-300"}
                size={19}
              />
              <p className="mt-4 text-2xl font-black">
                {items.filter(match).length}
              </p>
              <p
                className={`text-xs ${tab === id ? "text-zinc-950/75" : "text-white/75"}`}
              >
                {label}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={!item.movie}
              onClick={() => item.movie && setSelectedMovie(item.movie)}
              className="text-left disabled:opacity-50"
              aria-label={`${item.title}の詳細を開く`}
            >
              <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl bg-white/5">
                {item.posterUrl ? (
                  <Image
                    src={item.posterUrl}
                    alt={`${item.title} ポスター`}
                    fill
                    sizes="(max-width: 640px) 33vw, 16vw"
                    className="object-cover transition hover:scale-105"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-xs text-white/70">
                    NO IMAGE
                  </span>
                )}
                {item.isFavorite && (
                  <Heart
                    size={16}
                    className="absolute right-2 top-2 fill-rose-400 text-rose-400 drop-shadow"
                  />
                )}
              </span>
              <span className="mt-2 block truncate text-sm font-bold">
                {item.title}
              </span>
              {item.rating ? (
                <span className="mt-1 flex text-amber-300">
                  {Array.from({ length: 5 }, (_, star) => (
                    <Star
                      key={star}
                      size={12}
                      className={
                        star < (item.rating ?? 0) ? "fill-current" : ""
                      }
                    />
                  ))}
                </span>
              ) : null}
            </button>
          ))}
          {!visible.length && (
            <p className="col-span-full rounded-2xl border border-dashed border-white/25 bg-white/[0.03] p-8 text-center text-sm text-white/75">
              {loggedIn
                ? activeTab.empty
                : "ログインして作品棚を作りましょう。"}
            </p>
          )}
        </div>
      </section>

      {recommendations.length > 0 && (
        <section className="mt-10">
          <p className="text-xs font-bold tracking-widest text-lime-300">
            FOR YOU
          </p>
          <h2 className="mt-1 text-xl font-black">あなたへのおすすめ</h2>
          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {recommendations.map((movie) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => setSelectedMovie(movie)}
                className="w-32 shrink-0 text-left"
              >
                <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl">
                  <Image
                    src={movie.posterUrl}
                    alt={`${movie.title} ポスター`}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                </span>
                <span className="mt-2 line-clamp-2 block text-xs font-bold">
                  {movie.title}
                </span>
                <span className="mt-1 line-clamp-2 block text-[10px] text-lime-200">
                  {movie.recommendationReason}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedMovie && (
        <MovieDetails
          movie={selectedMovie}
          onClose={closeDetails}
          onSelectMovie={setSelectedMovie}
        />
      )}
    </>
  );
}
