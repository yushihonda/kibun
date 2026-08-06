"use client";

import {
  Filter,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MovieDetails } from "@/features/feed/movie-feed";
import { CategoryRails } from "@/features/search/category-rails";
import { buildSearchRails } from "@/lib/search/category-rails";
import {
  analyzeSearchQuery,
  rankSearchBatchesWithScores,
} from "@/lib/search/query-intent";
import { PROVIDER_FILTERS } from "@/lib/providers/catalog";
import {
  searchSessionHeaders,
  trackProductEvent,
} from "@/lib/analytics/client";
import type { Movie, MovieRail } from "@/types/movie";

type SearchResponse = {
  hits?: Movie[];
  movies?: Movie[];
  rails?: MovieRail[];
  estimatedTotalHits?: number;
  interpretation?: {
    labels?: string[];
  } | null;
};

const quickFilters = [
  { label: "見放題", key: "flatrate" },
  { label: "90分以内", key: "short" },
  { label: "★ 7.5以上", key: "high-rated" },
  ...PROVIDER_FILTERS.map(({ label, slug }) => ({ label, key: slug })),
] as const;

const providerSlugs = new Set<string>(
  PROVIDER_FILTERS.map((provider) => provider.slug),
);

export function SearchExperience({
  initialMovies,
  editorialMovies = [],
}: {
  initialMovies: Movie[];
  editorialMovies?: Movie[];
}) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [remoteMovies, setRemoteMovies] = useState<Movie[] | null>(null);
  const [remoteRails, setRemoteRails] = useState<MovieRail[] | null>(null);
  const [interpretation, setInterpretation] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxRuntime, setMaxRuntime] = useState("");
  const [minRating, setMinRating] = useState("");
  const [tags, setTags] = useState("");
  const [excludeWatched, setExcludeWatched] = useState(false);
  const [page, setPage] = useState(0);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const searchPlan = useMemo(() => analyzeSearchQuery(query), [query]);
  const hasRemoteSearchInput = Boolean(
    query.trim() ||
    activeFilters.size ||
    maxRuntime ||
    minRating ||
    tags.trim() ||
    excludeWatched ||
    page > 0,
  );

  useEffect(() => {
    if (!hasRemoteSearchInput) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({
        q: query,
        limit: "48",
        offset: String(page * 48),
      });
      const activeOfferTypes = ["flatrate", "rent", "buy"].filter((type) =>
        activeFilters.has(type),
      );
      if (activeOfferTypes.length) {
        params.set("offerTypes", activeOfferTypes.join(","));
      }
      if (activeFilters.has("short") || maxRuntime) {
        params.set(
          "maxRuntime",
          activeFilters.has("short") ? "90" : maxRuntime,
        );
      }
      if (activeFilters.has("high-rated") || minRating) {
        params.set(
          "minRating",
          activeFilters.has("high-rated") ? "7.5" : minRating,
        );
      }
      if (tags.trim()) params.set("tags", tags);
      if (excludeWatched) params.set("excludeWatched", "true");
      const activeProviders = [...activeFilters].filter((filter) =>
        providerSlugs.has(filter),
      );
      if (activeProviders.length) {
        params.set("providers", activeProviders.join(","));
      }

      try {
        const response = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
          headers: searchSessionHeaders(),
        });
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as SearchResponse;
        setRemoteMovies(data.hits ?? data.movies ?? []);
        setRemoteRails(data.rails ?? null);
        setInterpretation(data.interpretation?.labels ?? []);
        setEstimatedTotal(data.estimatedTotalHits ?? 0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteMovies(null);
          setRemoteRails(null);
          setInterpretation([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeFilters,
    excludeWatched,
    hasRemoteSearchInput,
    maxRuntime,
    minRating,
    page,
    query,
    tags,
  ]);

  const localResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = initialMovies.filter((movie) => {
      const haystack = [
        movie.title,
        movie.originalTitle,
        movie.overview,
        ...movie.genres,
        ...movie.emotionalTags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const queryMatches =
        searchPlan.expanded || !normalized || haystack.includes(normalized);
      const offerMatches =
        !activeFilters.has("flatrate") ||
        movie.providers.some((provider) => provider.type === "flatrate");
      const runtimeMatches = !activeFilters.has("short") || movie.runtime <= 90;
      const ratingMatches =
        (!activeFilters.has("high-rated") || movie.voteAverage >= 7.5) &&
        (!minRating || movie.voteAverage >= Number(minRating));
      const advancedRuntimeMatches =
        !maxRuntime || movie.runtime <= Number(maxRuntime);
      const advancedTags = tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
      const advancedTagMatches =
        !advancedTags.length ||
        advancedTags.every((tag) => haystack.includes(tag));
      const activeProviders = [...activeFilters].filter((filter) =>
        providerSlugs.has(filter),
      );
      const providerMatches =
        activeProviders.length === 0 ||
        movie.providers.some((provider) =>
          activeProviders.includes(provider.slug),
        );
      return (
        queryMatches &&
        offerMatches &&
        runtimeMatches &&
        ratingMatches &&
        advancedRuntimeMatches &&
        advancedTagMatches &&
        providerMatches
      );
    });
    if (!searchPlan.expanded) return filtered;
    return rankSearchBatchesWithScores(
      [
        {
          query: { text: "", weight: 1, source: "fallback" },
          movies: filtered,
        },
      ],
      searchPlan,
    ).map(({ movie, reasons }) => ({ ...movie, matchReasons: reasons }));
  }, [
    activeFilters,
    initialMovies,
    maxRuntime,
    minRating,
    query,
    searchPlan,
    tags,
  ]);

  const hasSearchInput = Boolean(
    query.trim() ||
    activeFilters.size ||
    maxRuntime ||
    minRating ||
    tags.trim() ||
    excludeWatched,
  );
  const movies = (hasRemoteSearchInput ? remoteMovies : null) ?? localResults;
  const rails =
    (hasRemoteSearchInput ? remoteRails : null) ??
    buildSearchRails(movies, searchPlan, {
      editorialMovies,
      emptyQuery: !query.trim(),
    });
  const interpretationLabels =
    interpretation.length > 0 ? interpretation : searchPlan.labels;

  const toggleFilter = (key: string) => {
    setPage(0);
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <main className="min-h-dvh bg-[#f4f1e8] pb-28 text-zinc-950">
      <div className="sticky top-0 z-30 border-b border-black/10 bg-[#f4f1e8]/92 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              prefetch={false}
              className="hidden text-lg font-black tracking-[0.18em] sm:block"
            >
              KIBUN
            </Link>
            <label className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 shadow-sm focus-within:ring-2 focus-within:ring-lime-500">
              <Search size={20} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                  setRemoteMovies(null);
                  setRemoteRails(null);
                  setInterpretation([]);
                }}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-zinc-400"
                placeholder="例：金曜の夜、何も考えずスカッとしたい"
                autoFocus
              />
              {loading ? (
                <LoaderCircle
                  className="animate-spin text-zinc-400"
                  size={18}
                />
              ) : (
                query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setPage(0);
                    }}
                    aria-label="入力を消す"
                  >
                    <X size={18} />
                  </button>
                )
              )}
            </label>
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="grid size-12 place-items-center rounded-2xl bg-zinc-950 text-white"
              aria-label="詳細フィルター"
              aria-expanded={showAdvanced}
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {quickFilters.map((filter) => {
              const active = activeFilters.has(filter.key);
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => toggleFilter(filter.key)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition ${
                    active
                      ? "border-zinc-950 bg-lime-300"
                      : "border-black/10 bg-white hover:border-black/30"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
          {showAdvanced && (
            <div className="mt-3 grid gap-3 rounded-2xl border border-black/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-bold">
                配信形態
                <span className="mt-2 flex gap-2">
                  {[
                    ["rent", "レンタル"],
                    ["buy", "購入"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFilter(key)}
                      aria-pressed={activeFilters.has(key)}
                      className={`rounded-full border px-3 py-2 ${activeFilters.has(key) ? "bg-lime-300" : "bg-zinc-50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </label>
              <label className="text-xs font-bold">
                上映時間（分以内）
                <input
                  type="number"
                  min="30"
                  max="300"
                  value={maxRuntime}
                  onChange={(event) => {
                    setMaxRuntime(event.target.value);
                    setPage(0);
                  }}
                  className="mt-2 w-full rounded-xl border border-black/10 bg-zinc-50 px-3 py-2"
                  placeholder="例: 120"
                />
              </label>
              <label className="text-xs font-bold">
                最低評価（TMDB 10点満点）
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={minRating}
                  onChange={(event) => {
                    setMinRating(event.target.value);
                    setPage(0);
                  }}
                  className="mt-2 w-full rounded-xl border border-black/10 bg-zinc-50 px-3 py-2"
                  placeholder="例: 7.5"
                />
              </label>
              <label className="text-xs font-bold">
                気分・ジャンル（カンマ区切り）
                <input
                  value={tags}
                  onChange={(event) => {
                    setTags(event.target.value);
                    setPage(0);
                  }}
                  className="mt-2 w-full rounded-xl border border-black/10 bg-zinc-50 px-3 py-2"
                  placeholder="泣ける,ドラマ"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={excludeWatched}
                  onChange={(event) => {
                    setExcludeWatched(event.target.checked);
                    setPage(0);
                  }}
                  className="size-4 accent-lime-500"
                />
                視聴済みを除外
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-zinc-500">
              {query ? "SEARCH RESULT" : "KIBUN SELECTION"}
            </p>
            <h1 className="mt-1 text-2xl font-black">
              {query ? `「${query}」に近い映画` : "今の気分に刺さる映画"}
            </h1>
          </div>
          <p className="text-xs font-semibold text-zinc-500">
            {movies.length}件
          </p>
        </div>

        {hasSearchInput && interpretationLabels.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-zinc-500">
              こんな気分と解釈
            </span>
            {interpretationLabels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-lime-700/20 bg-lime-200/70 px-2.5 py-1 font-bold text-lime-950"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {rails.length ? (
          <CategoryRails
            rails={rails}
            onSelect={(movie, railId) => {
              setSelectedMovie(movie);
              trackProductEvent({
                eventName: "movie_click",
                movieId: movie.id,
                sectionId: railId,
                query,
              });
            }}
          />
        ) : (
          <div className="mt-14 rounded-3xl border border-dashed border-black/20 p-12 text-center">
            <Filter className="mx-auto text-zinc-400" />
            <h2 className="mt-4 font-black">
              ぴったりの映画が見つかりませんでした
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              条件を少し減らすか、別の気分で検索してみてください。
            </p>
          </div>
        )}
        {(page > 0 || remoteMovies?.length === 48) && (
          <nav
            className="mt-8 flex items-center justify-center gap-3"
            aria-label="検索結果ページ"
          >
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="rounded-full border border-black/15 bg-white px-5 py-2 text-sm font-bold disabled:opacity-30"
            >
              前へ
            </button>
            <span className="text-xs font-bold text-zinc-500">
              {page + 1}ページ目
              {estimatedTotal > 0 ? ` / 推定${estimatedTotal}件` : ""}
            </span>
            <button
              type="button"
              disabled={(remoteMovies?.length ?? 0) < 48}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-full border border-black/15 bg-white px-5 py-2 text-sm font-bold disabled:opacity-30"
            >
              次へ
            </button>
          </nav>
        )}
      </div>
      {selectedMovie && (
        <MovieDetails
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onSelectMovie={setSelectedMovie}
          searchQuery={query}
        />
      )}
    </main>
  );
}
