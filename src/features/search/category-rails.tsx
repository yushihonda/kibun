"use client";

import { ResilientImage as Image } from "@/components/resilient-image";
import type { Movie, MovieRail } from "@/types/movie";

export function CategoryRails({
  rails,
  onSelect,
}: {
  rails: MovieRail[];
  onSelect: (movie: Movie, railId: string) => void;
}) {
  return (
    <div className="mt-6 space-y-8">
      {rails.map((rail, railIndex) => (
        <section key={rail.id} aria-label={rail.title}>
          <h2 className="mb-3 text-lg font-black tracking-tight">
            {rail.title}
          </h2>
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
            {rail.movies.map((movie, movieIndex) => (
              <button
                key={`${rail.id}-${movie.id}`}
                type="button"
                onClick={() => onSelect(movie, rail.id)}
                className="w-[38vw] max-w-[160px] shrink-0 snap-start text-left sm:w-[140px]"
                aria-label={`「${movie.title}」の詳細を見る`}
                data-movie-id={movie.id}
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-200 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                  <Image
                    src={movie.posterUrl}
                    alt={`${movie.title} ポスター`}
                    fill
                    sizes="160px"
                    loading={
                      railIndex === 0 && movieIndex === 0 ? "eager" : "lazy"
                    }
                    className="object-cover"
                  />
                  <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur">
                    ★ {movie.voteAverage.toFixed(1)}
                  </span>
                </div>
                <h3 className="mt-2 truncate text-sm font-black">
                  {movie.title}
                </h3>
                {movie.matchReasons?.length ? (
                  <p className="mt-1 line-clamp-2 text-[11px] font-medium text-lime-800">
                    {movie.matchReasons.join(" · ")}
                  </p>
                ) : movie.editorialComment ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                    編集部: {movie.editorialComment}
                  </p>
                ) : (
                  <p className="mt-1 truncate text-[11px] text-zinc-500">
                    {movie.emotionalTags.slice(0, 2).map((tag) => `#${tag} `)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
