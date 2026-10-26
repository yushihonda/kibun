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
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Brand } from "@/components/brand";
import { ProviderBadge } from "@/components/provider-badge";
import type { Movie, MovieRail, SocialPostPreview } from "@/types/movie";
import { formatRuntime } from "@/lib/utils";
import {
  isFreshSocialTrend,
  isNowPlayingTitle,
  newSeasonLabel,
} from "@/lib/discovery/ranking";
import { groupProviderServices } from "@/lib/providers/catalog";
import {
  getAnalyticsSessionId,
  trackProductEvent,
} from "@/lib/analytics/client";
import { savePendingInteraction } from "@/lib/auth/pending-actions";

// Comments load only when a detail sheet opens, keeping the feed bundle small.
const CommentSection = dynamic(() =>
  import("@/features/community/comment-section").then(
    (module) => module.CommentSection,
  ),
);

const compactNumber = new Intl.NumberFormat("ja-JP", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const INITIAL_FEED_ITEMS = 4;
const FEED_ITEMS_INCREMENT = 8;

type NetworkConnection = {
  saveData?: boolean;
  addEventListener?: EventTarget["addEventListener"];
  removeEventListener?: EventTarget["removeEventListener"];
};

function networkConnection(): NetworkConnection | undefined {
  return (navigator as Navigator & { connection?: NetworkConnection })
    .connection;
}

function subscribeToAutoplayPreference(onChange: () => void) {
  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const connection = networkConnection();
  motionPreference.addEventListener("change", onChange);
  connection?.addEventListener?.("change", onChange);
  return () => {
    motionPreference.removeEventListener("change", onChange);
    connection?.removeEventListener?.("change", onChange);
  };
}

function autoplayPreference() {
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !networkConnection()?.saveData
  );
}

function serverAutoplayPreference() {
  return false;
}

function sentimentLabel(
  sentiment: NonNullable<Movie["socialSignals"]>["sentiment"],
) {
  if (sentiment === "positive") return "好意的";
  if (sentiment === "negative") return "厳しめ";
  if (sentiment === "mixed") return "賛否あり";
  return "中立";
}

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
  const [loadedPosts, setLoadedPosts] = useState<{
    movieId: string;
    posts: SocialPostPreview[];
  } | null>(null);
  const featuredPosts = movie.socialSignals?.featuredPosts.length
    ? movie.socialSignals.featuredPosts
    : loadedPosts?.movieId === movie.id
      ? loadedPosts.posts
      : [];
  const needsPosts =
    Boolean(movie.socialSignals?.postCount) &&
    !movie.socialSignals?.featuredPosts.length;

  // Feeds omit TikTok post previews to stay small; fetch them on open.
  useEffect(() => {
    if (!needsPosts) return;
    const controller = new AbortController();
    void fetch(`/api/movies/${movie.id}/social`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { featuredPosts?: SocialPostPreview[] } | null) => {
        if (data?.featuredPosts) {
          setLoadedPosts({ movieId: movie.id, posts: data.featuredPosts });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [movie.id, needsPosts]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Callers often pass an inline handler; reading it through a ref keeps a
  // parent re-render from refetching details and re-logging the view.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
      if (event.key === "Escape") onCloseRef.current();
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
  }, [movie.id, movie.video]);

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
        className="mx-auto max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-white/10 bg-zinc-950 px-5 pb-10 pt-3 text-white shadow-2xl"
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
              {movie.mediaType === "tv" ? "ドラマ" : "映画"} ・ KIBUN PICK
              {isNowPlayingTitle(movie) ? " ・ 上映中" : ""}
              {newSeasonLabel(movie) ? ` ・ ${newSeasonLabel(movie)}` : ""}
            </p>
            <h2 className="mt-1 text-2xl font-black">{movie.title}</h2>
            <p className="mt-2 text-sm text-white/75">
              {movie.releaseDate.slice(0, 4)} ・ {formatRuntime(movie.runtime)}{" "}
              {movie.mediaType === "tv" ? "／話" : ""} ・ ★{" "}
              {movie.voteAverage.toFixed(1)}
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
              <div className="mt-3 flex items-center gap-2 text-xs text-white/75">
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
            {groupProviderServices(movie.providers).map((provider) => (
              <a
                key={provider.slug}
                href={
                  provider.tmdbLink ??
                  (movie.tmdbId
                    ? `https://www.themoviedb.org/${movie.mediaType}/${movie.tmdbId}/watch?locale=JP`
                    : "https://www.themoviedb.org/")
                }
                target="_blank"
                rel="noreferrer"
                className="min-w-36 rounded-xl bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                <ProviderBadge provider={provider} />
              </a>
            ))}
            {movie.providers.length === 0 && (
              <span className="text-sm font-bold opacity-65">
                配信先を確認中
              </span>
            )}
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

        {isFreshSocialTrend(movie) && movie.socialSignals && (
          <section className="mt-6 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/8 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-widest text-fuchsia-300">
                  TIKTOK TREND
                </p>
                <h3 className="mt-1 text-lg font-black">いまの口コミ</h3>
              </div>
              <p className="text-[10px] text-white/70">
                {movie.socialSignals.latestPostAt?.slice(0, 10)} 最新投稿
              </p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/25 p-2">
                <p className="text-lg font-black">
                  {compactNumber.format(movie.socialSignals.totalViews)}
                </p>
                <p className="text-[10px] text-white/70">再生</p>
              </div>
              <div className="rounded-xl bg-black/25 p-2">
                <p className="text-lg font-black">
                  {movie.socialSignals.averageEngagementRate.toFixed(1)}%
                </p>
                <p className="text-[10px] text-white/70">反応率</p>
              </div>
              <div className="rounded-xl bg-black/25 p-2">
                <p className="text-sm font-black">
                  {sentimentLabel(movie.socialSignals.sentiment)}
                </p>
                <p className="text-[10px] text-white/70">反応傾向</p>
              </div>
            </div>
            {movie.socialSignals.summary && (
              <p className="mt-4 text-sm leading-6 text-white/80">
                {movie.socialSignals.summary}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {movie.socialSignals.topics.slice(0, 4).map((topic) => (
                <span
                  key={topic}
                  className="rounded-full bg-fuchsia-300/15 px-2.5 py-1 text-[11px] font-bold text-fuchsia-100"
                >
                  {topic}
                </span>
              ))}
              {movie.socialSignals.topHashtags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/65"
                >
                  #{tag}
                </span>
              ))}
            </div>
            {featuredPosts.length > 0 && (
              <div className="mt-4 space-y-2">
                {featuredPosts.map((post) => (
                  <a
                    key={post.videoId}
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-fuchsia-300/40"
                  >
                    <p className="line-clamp-2 text-xs leading-5 text-white/80">
                      {post.caption || "TikTokの公開投稿"}
                    </p>
                    <p className="mt-2 text-[10px] font-bold text-fuchsia-200">
                      {post.authorUsername ? `@${post.authorUsername} ・ ` : ""}
                      {compactNumber.format(post.views)}回再生 ・ ER{" "}
                      {post.engagementRate.toFixed(1)}%
                    </p>
                  </a>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] leading-4 text-white/70">
              公開投稿のメタデータを集計。投稿を選ぶとTikTokで開きます。
            </p>
          </section>
        )}

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
            placeholder="この作品の感想を書く"
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
        <div className="mt-8">
          <CommentSection key={movie.id} target={{ movieId: movie.id }} />
        </div>
        {recommendations.length > 0 && (
          <section className="mt-8" aria-label="この作品が好きなら">
            <h3 className="text-lg font-black">この作品が好きなら</h3>
            <p className="mt-1 text-xs text-white/70">
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

export function MovieFeed({ sections }: { sections: MovieRail[] }) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const pendingScrollIndex = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const autoplayEnabled = useSyncExternalStore(
    subscribeToAutoplayPreference,
    autoplayPreference,
    serverAutoplayPreference,
  );
  const [manualPlaybackEnabled, setManualPlaybackEnabled] = useState(false);
  const videoPlaybackEnabled = autoplayEnabled || manualPlaybackEnabled;
  const [selected, setSelected] = useState<Movie | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const feedEntries = useMemo(
    () =>
      sections.flatMap((rail) =>
        rail.movies.map((movie, index) => ({
          movie,
          sectionId: rail.id,
          sectionTitle: rail.title,
          sectionDescription: rail.description,
          firstInSection: index === 0,
        })),
      ),
    [sections],
  );
  const [renderedCount, setRenderedCount] = useState(() =>
    Math.min(INITIAL_FEED_ITEMS, feedEntries.length),
  );
  const renderedEntries = feedEntries.slice(0, renderedCount);
  const activeMediaType = feedEntries[activeIndex]?.movie.mediaType ?? "movie";

  const scrollToIndex = (index: number) => {
    if (index < 0 || index >= feedEntries.length) return;
    if (index >= renderedCount) {
      pendingScrollIndex.current = index;
      setRenderedCount(index + 1);
      return;
    }
    scroller.current?.children[index]?.scrollIntoView({ behavior: "smooth" });
  };

  const jumpToMediaType = (mediaType: Movie["mediaType"]) =>
    scrollToIndex(
      feedEntries.findIndex((entry) => entry.movie.mediaType === mediaType),
    );

  useEffect(() => {
    const index = pendingScrollIndex.current;
    if (index === null || index >= renderedCount) return;
    pendingScrollIndex.current = null;
    const frame = window.requestAnimationFrame(() =>
      scroller.current?.children[index]?.scrollIntoView({ behavior: "smooth" }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [renderedCount]);

  useEffect(() => {
    const entry = feedEntries[activeIndex];
    if (!entry) return;
    trackProductEvent({
      eventName: "impression",
      movieId: entry.movie.id,
      sectionId: entry.sectionId,
    });
  }, [activeIndex, feedEntries]);

  useEffect(() => {
    const entry = feedEntries[activeIndex];
    if (!videoPlaybackEnabled || !entry?.movie.video) return;
    trackProductEvent({
      eventName: "playback_start",
      movieId: entry.movie.id,
      sectionId: entry.sectionId,
      metadata: { platform: entry.movie.video.platform, placement: "feed" },
    });
  }, [activeIndex, feedEntries, videoPlaybackEnabled]);

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
  }, [renderedCount]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const loadMore = () => {
      const preloadDistance = root.clientHeight * 3;
      if (
        root.scrollTop + root.clientHeight <
        root.scrollHeight - preloadDistance
      ) {
        return;
      }
      setRenderedCount((current) =>
        Math.min(current + FEED_ITEMS_INCREMENT, feedEntries.length),
      );
    };
    root.addEventListener("scroll", loadMore, { passive: true });
    return () => root.removeEventListener("scroll", loadMore);
  }, [feedEntries.length]);

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
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-black/80 to-transparent px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div className="pointer-events-auto">
              <Brand compact />
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <Link
                href="/search"
                prefetch={false}
                aria-label="気分で検索"
                className="flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs font-bold backdrop-blur-md"
              >
                <Search size={16} />
                <span className="hidden sm:inline">気分で検索</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setManualPlaybackEnabled(true);
                  setMuted((value) => !value);
                }}
                className="rounded-full border border-white/15 bg-black/35 p-2 backdrop-blur-md"
                aria-label={muted ? "音声をオン" : "ミュート"}
              >
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            </div>
          </div>
          <nav
            className="pointer-events-auto mx-auto mt-3 flex w-fit gap-1 rounded-full border border-white/15 bg-black/45 p-1 text-xs font-black backdrop-blur-md"
            aria-label="作品種別"
          >
            {[
              ["movie", "映画"],
              ["tv", "ドラマ"],
            ].map(([mediaType, label]) => {
              const available = feedEntries.some(
                (entry) => entry.movie.mediaType === mediaType,
              );
              const active = activeMediaType === mediaType;
              return (
                <button
                  key={mediaType}
                  type="button"
                  disabled={!available}
                  onClick={() =>
                    jumpToMediaType(mediaType as Movie["mediaType"])
                  }
                  aria-current={active ? "true" : undefined}
                  className={`rounded-full px-5 py-1.5 transition disabled:opacity-30 ${
                    active ? "bg-lime-300 text-zinc-950" : "text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div
        ref={scroller}
        className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        {renderedEntries.map(
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
              key={`${sectionId}:${movie.id}`}
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
                quality={55}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="object-cover object-center md:hidden"
              />
              <Image
                src={movie.backdropUrl}
                alt=""
                fill
                sizes="(max-width: 767px) 1px, 100vw"
                quality={55}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="hidden object-cover md:block"
              />
              {videoPlaybackEnabled &&
                index === activeIndex &&
                movie.video?.platform === "youtube" && (
                  <div
                    data-testid="feed-video-surface"
                    data-video-platform="youtube"
                    className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
                  >
                    <YouTubePlayer
                      videoId={movie.video.videoId}
                      active
                      muted={muted}
                      className="absolute top-1/2 left-1/2 h-full w-auto min-w-full max-w-none -translate-x-1/2 -translate-y-1/2 aspect-video"
                    />
                  </div>
                )}
              {videoPlaybackEnabled &&
                index === activeIndex &&
                movie.video?.platform === "tiktok" && (
                  <div
                    data-testid="feed-video-surface"
                    data-video-platform="tiktok"
                    className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
                  >
                    <TikTokPlayer
                      videoId={movie.video.videoId}
                      active
                      className="h-full w-full"
                    />
                  </div>
                )}
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black via-black/15 to-black/40" />
              {!videoPlaybackEnabled &&
                index === activeIndex &&
                movie.video && (
                  <button
                    type="button"
                    onClick={() => setManualPlaybackEnabled(true)}
                    className="absolute top-1/2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/55 px-5 py-3 text-sm font-black text-white shadow-xl backdrop-blur-md transition hover:scale-105 hover:bg-black/70"
                    aria-label="予告編を再生"
                  >
                    <Play size={20} className="fill-current" />
                    予告編を再生
                  </button>
                )}
              <div
                data-testid="feed-summary"
                className="absolute inset-x-0 bottom-20 z-20 flex items-end gap-2 px-4 pb-4 md:bottom-8 md:gap-3 md:px-10 md:pb-7"
              >
                <div className="min-w-0 flex-1">
                  {firstInSection && (
                    <div className="mb-1 max-w-xl md:mb-3">
                      <p className="text-xs font-black tracking-[0.16em] text-lime-300">
                        {sectionTitle}
                      </p>
                      {sectionDescription && (
                        <p
                          data-testid="feed-section-description"
                          className="mt-1 text-xs text-white/80 drop-shadow-md max-md:hidden"
                        >
                          {sectionDescription}
                        </p>
                      )}
                    </div>
                  )}
                  <div
                    data-testid="feed-emotional-tags"
                    className="mb-3 flex flex-wrap gap-2 max-md:hidden"
                  >
                    {movie.emotionalTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[11px] font-semibold backdrop-blur"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h1
                    data-testid="feed-movie-title"
                    className="line-clamp-1 text-2xl leading-tight font-black drop-shadow-lg md:line-clamp-2 md:text-5xl"
                  >
                    {movie.title}
                  </h1>
                  {movie.editorialComment && (
                    <p className="mt-2 max-w-xl text-sm font-semibold text-lime-200 max-md:hidden md:line-clamp-2">
                      編集部: {movie.editorialComment}
                    </p>
                  )}
                  <p className="mt-1 text-xs font-medium text-white/85 drop-shadow-md md:mt-2 md:text-sm">
                    <span className="font-black text-white">
                      {movie.mediaType === "tv" ? "ドラマ" : "映画"}
                    </span>
                    {isNowPlayingTitle(movie) && (
                      <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 font-black text-white">
                        上映中
                      </span>
                    )}
                    {newSeasonLabel(movie) && (
                      <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 font-black text-white">
                        {newSeasonLabel(movie)}
                      </span>
                    )}{" "}
                    ・ {movie.releaseDate.slice(0, 4)} ・{" "}
                    {formatRuntime(movie.runtime)}
                    {movie.mediaType === "tv" ? "／話" : ""} ・
                    <span className="ml-1 text-amber-300">
                      ★ {movie.voteAverage.toFixed(1)}
                    </span>
                  </p>
                  {isFreshSocialTrend(movie) && (
                    <p className="mt-2 w-fit rounded-full bg-fuchsia-600/90 px-3 py-1 text-[11px] font-black text-white shadow-lg">
                      TikTokで話題 ・{" "}
                      {compactNumber.format(
                        movie.socialSignals?.totalViews ?? 0,
                      )}
                      回再生
                    </p>
                  )}
                  <p
                    data-testid="feed-overview"
                    className="mt-3 max-w-xl text-sm leading-6 text-white/80 max-md:hidden md:line-clamp-2"
                  >
                    {movie.overview}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] max-md:hidden">
                    {groupProviderServices(movie.providers)
                      .slice(0, 5)
                      .map((provider) => (
                        <ProviderBadge
                          key={provider.slug}
                          provider={provider}
                          variant="icon"
                        />
                      ))}
                    <span className="text-white/75 drop-shadow-md">
                      Powered by JustWatch
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-3 md:gap-4">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(movie.id)}
                    className="grid size-10 place-items-center rounded-full bg-black/35 backdrop-blur transition hover:scale-105 md:size-12"
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
                    className="grid size-10 place-items-center rounded-full bg-white text-zinc-950 transition hover:scale-105 md:size-12"
                    aria-label="作品情報"
                  >
                    <Info size={25} />
                  </button>
                  <a
                    href={
                      movie.tmdbId
                        ? `https://www.themoviedb.org/${movie.mediaType}/${movie.tmdbId}/watch?locale=JP`
                        : "#"
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="grid size-10 place-items-center rounded-full bg-lime-300 text-zinc-950 transition hover:scale-105 md:size-12"
                    aria-label="配信先を確認"
                  >
                    <Play size={23} className="fill-current" />
                  </a>
                </div>
              </div>
              {index === 0 && (
                <div className="absolute top-24 left-1/2 z-20 flex -translate-x-1/2 animate-bounce flex-col items-center text-[10px] font-bold text-white/60">
                  SWIPE
                  <ChevronDown size={16} />
                </div>
              )}
            </article>
          ),
        )}
      </div>

      <div
        className={`fixed top-1/2 right-1.5 z-30 flex -translate-y-1/2 flex-col ${
          feedEntries.length > 24 ? "gap-0.5" : "gap-1"
        }`}
      >
        {feedEntries.map(({ movie, sectionId }, index) => (
          <button
            key={`${sectionId}:${movie.id}`}
            type="button"
            onClick={() => scrollToIndex(index)}
            aria-label={`${index + 1}本目へ`}
            className={`${feedEntries.length > 24 ? "h-1.5" : "h-5"} w-0.5 rounded-full transition ${
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
