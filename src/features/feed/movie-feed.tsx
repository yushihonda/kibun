"use client";

import {
  Bookmark,
  Check,
  ChevronDown,
  Heart,
  Info,
  Play,
  Search,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ResilientImage as Image } from "@/components/resilient-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import type { Movie, MovieRail } from "@/types/movie";
import { formatRuntime } from "@/lib/utils";
import {
  getAnalyticsSessionId,
  trackProductEvent,
} from "@/lib/analytics/client";
import { savePendingInteraction } from "@/lib/auth/pending-actions";

function YouTubePlayer({
  videoId,
  active,
  muted,
  className = "h-full w-full",
}: {
  videoId: string;
  active: boolean;
  muted: boolean;
  className?: string;
}) {
  if (!active) return null;

  const params = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
    controls: "1",
    loop: "1",
    playlist: videoId,
    playsinline: "1",
    rel: "0",
  });

  return (
    <iframe
      className={className}
      src={`https://www.youtube-nocookie.com/embed/${videoId}?${params}`}
      title="予告編"
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      loading="lazy"
    />
  );
}

function TikTokPlayer({
  videoId,
  active,
  className = "h-full w-full",
}: {
  videoId: string;
  active: boolean;
  className?: string;
}) {
  if (!active) return null;
  return (
    <iframe
      className={className}
      src={`https://www.tiktok.com/player/v1/${encodeURIComponent(videoId)}?autoplay=1&loop=1&controls=1&music_info=1&description=1&rel=0`}
      title="TikTok予告編"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  );
}

export function MovieDetails({
  movie,
  onClose,
  onSelectMovie,
  searchQuery,
}: {
  movie: Movie;
  onClose: () => void;
  onSelectMovie?: (movie: Movie) => void;
  searchQuery?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"WATCHED" | "WATCHLIST" | "NONE">(
    "NONE",
  );
  const [favorite, setFavorite] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const trailerMuted = true;
  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const [interactionResponse, reviewResponse, recommendationResponse] =
        await Promise.all([
          fetch(`/api/movies/${movie.id}/interaction`, {
            signal: controller.signal,
          }),
          fetch(`/api/movies/${movie.id}/review`, {
            signal: controller.signal,
          }),
          fetch(`/api/recommendations?seed=${movie.id}&limit=10`, {
            signal: controller.signal,
          }),
        ]);
      if (interactionResponse.ok) {
        const data = (await interactionResponse.json()) as {
          interaction?: {
            status: "WATCHED" | "WATCHLIST" | "NONE";
            is_favorite: boolean;
            rating: number | null;
          } | null;
        };
        if (data.interaction) {
          setStatus(data.interaction.status);
          setFavorite(data.interaction.is_favorite);
          setRating(data.interaction.rating);
        }
      }
      if (reviewResponse.ok) {
        const data = (await reviewResponse.json()) as {
          review?: { body: string } | null;
        };
        if (data.review?.body) setReview(data.review.body);
      }
      if (recommendationResponse.ok) {
        const data = (await recommendationResponse.json()) as {
          movies?: Movie[];
        };
        setRecommendations(data.movies ?? []);
      }
    };
    void load().catch(() => undefined);
    trackProductEvent({ eventName: "detail_view", movieId: movie.id });
    if (movie.video) {
      trackProductEvent({
        eventName: "playback_start",
        movieId: movie.id,
        metadata: { platform: movie.video.platform, placement: "detail" },
      });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      controller.abort();
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [movie.id, movie.video, onClose]);

  const save = async (payload: {
    status?: "WATCHED" | "WATCHLIST" | "NONE";
    isFavorite?: boolean;
    rating?: number | null;
  }) => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/movies/${movie.id}/interaction`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        loginUrl?: string;
        error?: string;
        interaction?: {
          status: "WATCHED" | "WATCHLIST" | "NONE";
          is_favorite: boolean;
          rating: number | null;
        };
      };
      if (response.status === 401 && data.loginUrl) {
        savePendingInteraction(movie.id, payload);
        router.push(data.loginUrl);
        return;
      }
      if (!response.ok || !data.interaction) throw new Error(data.error);
      setStatus(data.interaction.status);
      setFavorite(data.interaction.is_favorite);
      setRating(data.interaction.rating);
      setMessage("保存しました");
      trackProductEvent({
        eventName: "save",
        movieId: movie.id,
        metadata: payload,
      });
    } catch {
      setMessage(
        "保存できませんでした。ログインまたは設定を確認してください。",
      );
    } finally {
      setSaving(false);
    }
  };

  const sendFeedback = async (isRelevant: boolean) => {
    if (!searchQuery?.trim()) return;
    const response = await fetch("/api/search-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: getAnalyticsSessionId(),
        query: searchQuery,
        movieId: movie.id,
        isRelevant,
      }),
    });
    if (response.ok) {
      setFeedback(isRelevant);
      trackProductEvent({
        eventName: "recommendation_feedback",
        movieId: movie.id,
        query: searchQuery,
        metadata: { isRelevant },
      });
    }
  };

  const saveReview = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/movies/${movie.id}/review`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: review }),
      });
      const data = (await response.json()) as {
        loginUrl?: string;
        error?: string;
      };
      if (response.status === 401 && data.loginUrl) {
        router.push(data.loginUrl);
        return;
      }
      if (!response.ok) throw new Error(data.error);
      setMessage("レビューを保存しました");
    } catch {
      setMessage("レビューを保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${movie.title}の詳細`}
      onClick={onClose}
    >
      <section
        className="mx-auto max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-white/10 bg-zinc-950 px-5 pb-10 pt-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-white/25"
          onClick={onClose}
          aria-label="閉じる"
        />

        <div className="relative mb-5 aspect-video overflow-hidden rounded-2xl bg-zinc-900">
          {movie.video?.platform === "youtube" ? (
            <>
              <Image
                src={movie.backdropUrl || movie.posterUrl}
                alt=""
                fill
                sizes="672px"
                className="object-cover"
              />
              <YouTubePlayer
                videoId={movie.video.videoId}
                active
                muted={trailerMuted}
                className="absolute inset-0 h-full w-full"
              />
            </>
          ) : movie.video?.platform === "tiktok" ? (
            <>
              <Image
                src={movie.backdropUrl || movie.posterUrl}
                alt=""
                fill
                sizes="672px"
                className="object-cover opacity-45"
              />
              <TikTokPlayer
                videoId={movie.video.videoId}
                active
                className="absolute inset-0 h-full w-full"
              />
            </>
          ) : (
            <>
              <Image
                src={movie.backdropUrl || movie.posterUrl}
                alt=""
                fill
                sizes="672px"
                className="scale-110 object-cover opacity-35 blur-xl"
              />
              <div className="absolute inset-y-0 left-1/2 aspect-[2/3] -translate-x-1/2 overflow-hidden shadow-2xl">
                <Image
                  src={movie.posterUrl}
                  alt={`${movie.title} ポスター`}
                  fill
                  sizes="240px"
                  className="object-cover"
                />
              </div>
              <p className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white/80">
                予告編はまだありません
              </p>
            </>
          )}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-lime-300">
              KIBUN PICK
            </p>
            <h2 className="mt-1 text-2xl font-black">{movie.title}</h2>
            <p className="mt-2 text-sm text-white/60">
              {movie.releaseDate.slice(0, 4)} ・ {formatRuntime(movie.runtime)}{" "}
              ・ ★ {movie.voteAverage.toFixed(1)}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-white/10 p-2 hover:bg-white/20"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>

        {movie.editorialComment && (
          <div className="mt-5 rounded-2xl border border-lime-300/30 bg-lime-300/10 p-4">
            <p className="text-xs font-bold tracking-widest text-lime-300">
              編集部のおすすめ
            </p>
            <p className="mt-2 text-sm leading-6 text-white/85">
              {movie.editorialComment}
            </p>
          </div>
        )}

        {movie.matchReasons?.length ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {movie.matchReasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1 text-[11px] font-bold text-lime-200"
                >
                  {reason}
                </span>
              ))}
            </div>
            {searchQuery && (
              <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                <span>この推薦は？</span>
                <button
                  type="button"
                  onClick={() => sendFeedback(true)}
                  className={`rounded-full border px-3 py-1.5 ${feedback === true ? "border-lime-300 bg-lime-300 text-zinc-950" : "border-white/15"}`}
                >
                  合っている
                </button>
                <button
                  type="button"
                  onClick={() => sendFeedback(false)}
                  className={`rounded-full border px-3 py-1.5 ${feedback === false ? "border-rose-300 bg-rose-300 text-zinc-950" : "border-white/15"}`}
                >
                  違う
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl bg-lime-300 p-4 text-zinc-950">
          <p className="text-xs font-bold">今すぐ観る</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {movie.providers.map((provider) => (
              <a
                key={`${provider.id}-${provider.type}`}
                href={
                  movie.tmdbId
                    ? `https://www.themoviedb.org/movie/${movie.tmdbId}/watch?locale=JP`
                    : "https://www.themoviedb.org/"
                }
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white"
              >
                {provider.name}
                {provider.type === "flatrate" ? " 見放題" : " で観る"}
              </a>
            ))}
          </div>
          <p className="mt-3 text-[10px] opacity-70">配信情報提供: JustWatch</p>
          {movie.providersCheckedAt && (
            <p className="mt-1 text-[10px] opacity-70">
              配信状況の確認日: {movie.providersCheckedAt.slice(0, 10)}
            </p>
          )}
        </div>

        <p className="mt-5 text-sm leading-7 text-white/75">{movie.overview}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {movie.emotionalTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {[
            {
              label: "見た",
              icon: Check,
              active: status === "WATCHED",
              action: () =>
                save({ status: status === "WATCHED" ? "NONE" : "WATCHED" }),
            },
            {
              label: "見たい",
              icon: Bookmark,
              active: status === "WATCHLIST",
              action: () =>
                save({
                  status: status === "WATCHLIST" ? "NONE" : "WATCHLIST",
                }),
            },
            {
              label: "お気に入り",
              icon: Heart,
              active: favorite,
              action: () => save({ isFavorite: !favorite }),
            },
          ].map(({ label, icon: Icon, active, action }) => (
            <button
              key={label}
              type="button"
              disabled={saving}
              onClick={action}
              className={`flex flex-col items-center gap-2 rounded-2xl px-3 py-4 text-xs font-bold disabled:opacity-50 ${
                active
                  ? "bg-lime-300 text-zinc-950"
                  : "bg-white/7 hover:bg-white/12"
              }`}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold">あなたの評価</legend>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                disabled={saving}
                onClick={() => save({ rating: star })}
                className={`rounded-lg p-2 hover:bg-white/10 hover:text-amber-300 ${
                  star <= (rating ?? 0) ? "text-amber-300" : "text-white/35"
                }`}
                aria-label={`${star}点`}
              >
                <Star
                  size={24}
                  className={star <= (rating ?? 0) ? "fill-current" : undefined}
                />
              </button>
            ))}
          </div>
        </fieldset>

        <form className="mt-6" onSubmit={saveReview}>
          <label className="text-sm font-bold" htmlFor={`review-${movie.id}`}>
            レビュー
          </label>
          <textarea
            id={`review-${movie.id}`}
            value={review}
            onChange={(event) => setReview(event.target.value)}
            required
            maxLength={4000}
            className="mt-2 min-h-24 w-full rounded-2xl border border-white/15 bg-white/5 p-3 text-sm outline-none focus:ring-2 focus:ring-lime-300"
            placeholder="この映画の感想を書く"
          />
          <button
            disabled={saving || !review.trim()}
            className="mt-2 w-full rounded-full border border-white/15 py-3 text-sm font-bold hover:bg-white/5 disabled:opacity-40"
          >
            レビューを保存
          </button>
        </form>
        {message && (
          <p className="mt-3 text-center text-xs text-white/65">{message}</p>
        )}
        {recommendations.length > 0 && (
          <section className="mt-8" aria-label="この作品が好きなら">
            <h3 className="text-lg font-black">この作品が好きなら</h3>
            <p className="mt-1 text-xs text-white/50">
              ジャンル・気分・スタッフの共通点から選びました
            </p>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {recommendations.map((recommendation) => (
                <button
                  type="button"
                  key={recommendation.id}
                  onClick={() => onSelectMovie?.(recommendation)}
                  className="w-28 shrink-0 text-left"
                >
                  <span className="relative block aspect-[2/3] overflow-hidden rounded-xl bg-white/5">
                    <Image
                      src={recommendation.posterUrl}
                      alt={`${recommendation.title} ポスター`}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  </span>
                  <span className="mt-2 line-clamp-2 block text-xs font-bold">
                    {recommendation.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[10px] text-lime-200">
                    {recommendation.recommendationReason}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}

export function MovieFeed({
  movies,
  sections,
}: {
  movies: Movie[];
  sections?: MovieRail[];
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const feedEntries = useMemo(
    () =>
      sections?.length
        ? sections.flatMap((rail) =>
            rail.movies.map((movie, index) => ({
              movie,
              sectionId: rail.id,
              sectionTitle: rail.title,
              sectionDescription: rail.description,
              firstInSection: index === 0,
            })),
          )
        : movies.map((movie, index) => ({
            movie,
            sectionId: "feed",
            sectionTitle: "おすすめ",
            sectionDescription: undefined,
            firstInSection: index === 0,
          })),
    [movies, sections],
  );

  useEffect(() => {
    const entry = feedEntries[activeIndex];
    if (!entry) return;
    trackProductEvent({
      eventName: "impression",
      movieId: entry.movie.id,
      sectionId: entry.sectionId,
    });
    if (entry.movie.video) {
      trackProductEvent({
        eventName: "playback_start",
        movieId: entry.movie.id,
        sectionId: entry.sectionId,
        metadata: { platform: entry.movie.video.platform, placement: "feed" },
      });
    }
  }, [activeIndex, feedEntries]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          setActiveIndex(Number((visible.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.55, 0.8] },
    );

    root
      .querySelectorAll("[data-index]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const toggleFavorite = async (id: string) => {
    const nextValue = !favorites.has(id);
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      const response = await fetch(`/api/movies/${id}/interaction`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isFavorite: nextValue }),
      });
      const data = (await response.json()) as { loginUrl?: string };
      if (response.status === 401 && data.loginUrl) {
        savePendingInteraction(id, { isFavorite: nextValue });
        router.push(data.loginUrl);
      }
      if (!response.ok) throw new Error();
      trackProductEvent({
        eventName: "save",
        movieId: id,
        metadata: { isFavorite: nextValue },
      });
    } catch {
      setFavorites((current) => {
        const next = new Set(current);
        if (nextValue) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  return (
    <main className="relative h-dvh overflow-hidden bg-black">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto flex max-w-6xl items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto">
          <Brand compact />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            href="/search"
            className="flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs font-bold backdrop-blur-md"
          >
            <Search size={16} />
            気分で検索
          </Link>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="rounded-full border border-white/15 bg-black/35 p-2 backdrop-blur-md"
            aria-label={muted ? "音声をオン" : "ミュート"}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      </header>

      <div
        ref={scroller}
        className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        {feedEntries.map(
          (
            {
              movie,
              sectionId,
              sectionTitle,
              sectionDescription,
              firstInSection,
            },
            index,
          ) => (
            <article
              key={movie.id}
              data-index={index}
              data-movie-id={movie.id}
              data-testid="movie-feed-item"
              data-section-id={sectionId}
              className="relative h-dvh snap-start snap-always overflow-hidden"
            >
              <Image
                src={movie.posterUrl}
                alt=""
                fill
                sizes="(max-width: 767px) 100vw, 1px"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="object-cover object-center md:hidden"
              />
              <Image
                src={movie.backdropUrl}
                alt=""
                fill
                sizes="(max-width: 767px) 1px, 100vw"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="hidden object-cover md:block"
              />
              {movie.video?.platform === "youtube" && (
                <div className="absolute top-28 right-4 left-4 z-10 mx-auto aspect-video max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl md:top-24">
                  <YouTubePlayer
                    videoId={movie.video.videoId}
                    active={index === activeIndex}
                    muted={muted}
                    className="h-full w-full"
                  />
                </div>
              )}
              {movie.video?.platform === "tiktok" && (
                <div className="absolute top-24 left-1/2 z-10 h-[54dvh] w-[min(88vw,340px)] -translate-x-1/2 overflow-hidden rounded-2xl bg-black shadow-2xl">
                  <TikTokPlayer
                    videoId={movie.video.videoId}
                    active={index === activeIndex}
                    className="h-full w-full"
                  />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-black/30" />
              <div className="absolute inset-x-0 bottom-20 flex items-end gap-3 px-5 pb-7 md:bottom-8 md:px-10">
                <div className="min-w-0 flex-1">
                  {firstInSection && (
                    <div className="mb-3 max-w-xl">
                      <p className="text-xs font-black tracking-[0.16em] text-lime-300">
                        {sectionTitle}
                      </p>
                      {sectionDescription && (
                        <p className="mt-1 text-xs text-white/55">
                          {sectionDescription}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mb-3 flex flex-wrap gap-2">
                    {movie.emotionalTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[11px] font-semibold backdrop-blur"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h1 className="text-3xl leading-tight font-black drop-shadow-lg md:text-5xl">
                    {movie.title}
                  </h1>
                  {movie.editorialComment && (
                    <p className="mt-2 line-clamp-2 max-w-xl text-sm font-semibold text-lime-200">
                      編集部: {movie.editorialComment}
                    </p>
                  )}
                  <p className="mt-2 text-sm font-medium text-white/70">
                    {movie.releaseDate.slice(0, 4)} ・{" "}
                    {formatRuntime(movie.runtime)} ・
                    <span className="ml-1 text-amber-300">
                      ★ {movie.voteAverage.toFixed(1)}
                    </span>
                  </p>
                  <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-6 text-white/80">
                    {movie.overview}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    {movie.providers.map((provider) => (
                      <span
                        key={`${provider.id}-${provider.type}`}
                        className="rounded-md bg-white px-2 py-1 font-black text-zinc-900"
                      >
                        {provider.name}
                      </span>
                    ))}
                    <span className="text-white/45">Powered by JustWatch</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(movie.id)}
                    className="grid size-12 place-items-center rounded-full bg-black/35 backdrop-blur transition hover:scale-105"
                    aria-label="お気に入り"
                  >
                    <Heart
                      size={25}
                      className={
                        favorites.has(movie.id)
                          ? "fill-rose-500 text-rose-500"
                          : undefined
                      }
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(movie);
                      trackProductEvent({
                        eventName: "movie_click",
                        movieId: movie.id,
                        sectionId,
                      });
                    }}
                    className="grid size-12 place-items-center rounded-full bg-white text-zinc-950 transition hover:scale-105"
                    aria-label="作品情報"
                  >
                    <Info size={25} />
                  </button>
                  <a
                    href={
                      movie.tmdbId
                        ? `https://www.themoviedb.org/movie/${movie.tmdbId}/watch?locale=JP`
                        : "#"
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="grid size-12 place-items-center rounded-full bg-lime-300 text-zinc-950 transition hover:scale-105"
                    aria-label="配信先を確認"
                  >
                    <Play size={23} className="fill-current" />
                  </a>
                </div>
              </div>
              {index === 0 && (
                <div className="absolute top-24 left-1/2 flex -translate-x-1/2 animate-bounce flex-col items-center text-[10px] font-bold text-white/60">
                  SWIPE
                  <ChevronDown size={16} />
                </div>
              )}
            </article>
          ),
        )}
      </div>

      <div className="fixed top-1/2 right-1.5 z-30 flex -translate-y-1/2 flex-col gap-1">
        {feedEntries.map(({ movie }, index) => (
          <button
            key={movie.id}
            type="button"
            onClick={() =>
              scroller.current?.children[index]?.scrollIntoView({
                behavior: "smooth",
              })
            }
            aria-label={`${index + 1}本目へ`}
            className={`h-5 w-0.5 rounded-full transition ${
              index === activeIndex ? "bg-lime-300" : "bg-white/25"
            }`}
          />
        ))}
      </div>

      {selected && (
        <MovieDetails
          movie={selected}
          onClose={() => setSelected(null)}
          onSelectMovie={setSelected}
        />
      )}
    </main>
  );
}
