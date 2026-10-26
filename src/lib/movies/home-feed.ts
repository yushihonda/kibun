import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  discoveryScore,
  evergreenScore,
  isEvergreenTitle,
  isFreshSocialTrend,
  isFreshTrend,
  isNowPlayingTitle,
  isRecentTitle,
  recentScore,
  socialTrendBoost,
  theatricalScore,
  trendMomentum,
  trendScore,
} from "@/lib/discovery/ranking";
import { loadCatalogMovies, type CatalogMovie } from "@/lib/movies/catalog";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import { prioritizeHomeFeedSections } from "@/lib/movies/home-feed-priority";
import {
  blendWithInterest,
  interestAffinity,
  interleaveForDiscovery,
} from "@/lib/recommendations/engine";
import {
  loadRecommendations,
  loadSharedCandidatePool,
} from "@/lib/recommendations/server";
import type { Movie, MovieRail } from "@/types/movie";

type SavedRow = { movie_id: string; save_count: number | string };

function stableSort<T extends CatalogMovie>(
  movies: T[],
  score: (movie: T) => number,
): T[] {
  return [...movies].sort(
    (a, b) => score(b) - score(a) || a.id.localeCompare(b.id),
  );
}

function uniqueMovies(groups: CatalogMovie[][]): CatalogMovie[] {
  return [
    ...new Map(
      groups.flat().map((movie) => [movie.id, movie] as const),
    ).values(),
  ];
}

// Taste matching needs cast, crew and keywords, but the feed UI does not;
// leaving them out keeps the rendered page small.
function toFeedMovie(movie: Movie): Movie {
  const feedMovie = { ...movie };
  delete feedMovie.cast;
  delete feedMovie.directors;
  delete feedMovie.keywords;
  delete feedMovie.aliases;
  // TikTok post previews are the largest part of each title and only appear
  // deep in the detail sheet, which loads them when it opens.
  if (feedMovie.socialSignals) {
    feedMovie.socialSignals = { ...feedMovie.socialSignals, featuredPosts: [] };
  }
  return feedMovie;
}

function section(
  id: string,
  title: string,
  description: string,
  candidates: Movie[],
  used: Set<string>,
  generatedAt: string,
  options?: { allowReuse?: boolean },
): MovieRail | null {
  const allowReuse = options?.allowReuse ?? false;
  const movies = candidates
    .filter((movie) => allowReuse || !used.has(movie.id))
    .slice(0, 8);
  if (!movies.length) return null;
  if (!allowReuse) {
    for (const movie of movies) used.add(movie.id);
  }
  return { id, title, description, movies, generatedAt };
}

export async function loadHomeFeed(
  supabase: SupabaseClient,
  options?: { now?: Date; user?: User | null },
): Promise<{
  sections: MovieRail[];
  personalized: boolean;
  generatedAt: string;
}> {
  const now = options?.now ?? new Date();
  const generatedAt = now.toISOString();
  const user =
    options && "user" in options
      ? (options.user ?? null)
      : (await supabase.auth.getUser()).data.user;
  const theatricalSince = new Date(
    now.getTime() - 4 * 86_400_000,
  ).toISOString();
  const emptyRecommendations = {
    movies: [],
    personalized: false,
    personalizationEnabled: true,
    onboardingCompleted: false,
    signalCount: 0,
    profile: null,
    watchedIds: [] as string[],
    favoriteIds: [] as string[],
  };
  const [
    sharedPool,
    theatricalPool,
    editorial,
    recommendationResult,
    savedResult,
  ] = await Promise.all([
    loadSharedCandidatePool(supabase, now),
    loadCatalogMovies(supabase, {
      limit: 80,
      orderBy: "theatrical_at",
      theatricalSince,
      includeRecommendationMetadata: true,
    }).catch(() => []),
    loadEditorialMovies(supabase, { limit: 8 }).catch(() => []),
    user
      ? loadRecommendations(supabase, { limit: 32, now, user }).catch(
          () => emptyRecommendations,
        )
      : Promise.resolve(emptyRecommendations),
    supabase.rpc("most_saved_movies", { p_limit: 60 }),
  ]);
  const pool = uniqueMovies([theatricalPool, sharedPool]);
  const watchedIds = new Set(recommendationResult.watchedIds);
  // Titles the viewer has already watched or loved are not news to them.
  const knownIds = new Set([
    ...recommendationResult.watchedIds,
    ...recommendationResult.favoriteIds,
  ]);
  const profile = recommendationResult.profile;
  const affinity = new Map<string, number>(
    profile
      ? pool.map((movie) => [movie.id, interestAffinity(movie, profile).score])
      : [],
  );
  const rank = <T extends CatalogMovie>(
    movies: T[],
    score: (movie: T) => number,
  ): T[] =>
    profile
      ? blendWithInterest(
          movies.filter((movie) => !knownIds.has(movie.id)),
          score,
          affinity,
        )
      : stableSort(movies, score);

  const editorialById = new Map(
    editorial.map((movie) => [movie.id, movie.editorialComment]),
  );
  const enrichedPool = pool.map((movie) =>
    editorialById.has(movie.id)
      ? { ...movie, editorialComment: editorialById.get(movie.id) }
      : movie,
  );
  const byId = new Map(enrichedPool.map((movie) => [movie.id, movie]));
  const saveCount = new Map(
    ((savedResult.data ?? []) as SavedRow[]).map((row) => [
      row.movie_id,
      Number(row.save_count),
    ]),
  );
  const used = new Set<string>();
  const sections: MovieRail[] = [];
  const push = (value: MovieRail | null) => value && sections.push(value);

  if (recommendationResult.personalized) {
    push(
      section(
        "for-you-movies",
        "あなたへの映画",
        "映画棚と好みをもとにした未視聴映画",
        recommendationResult.movies.filter(
          (movie) => movie.mediaType === "movie",
        ),
        used,
        generatedAt,
      ),
    );
    push(
      section(
        "for-you-dramas",
        "あなたへのドラマ",
        "映画棚と好みをもとにした未視聴ドラマ",
        recommendationResult.movies.filter((movie) => movie.mediaType === "tv"),
        used,
        generatedAt,
      ),
    );
    if (recommendationResult.signalCount >= 3) {
      push(
        section(
          "similar-favorite-movies",
          "お気に入りに似た映画",
          "ジャンル・気分・監督・出演者の共通点から選定",
          recommendationResult.movies.filter(
            (movie) => movie.mediaType === "movie",
          ),
          used,
          generatedAt,
        ),
      );
      push(
        section(
          "similar-favorite-dramas",
          "お気に入りに似たドラマ",
          "ジャンル・気分・監督・出演者の共通点から選定",
          recommendationResult.movies.filter(
            (movie) => movie.mediaType === "tv",
          ),
          used,
          generatedAt,
        ),
      );
    }
  }

  const socialCandidates = rank(
    enrichedPool.filter((movie) => isFreshSocialTrend(movie, now)),
    (movie) => socialTrendBoost(movie, now),
  );
  push(
    section(
      "tiktok-trending-movies",
      "TikTokで話題の映画",
      "公開投稿の再生数・反応率・新しさから、いま口コミが動いている映画",
      socialCandidates.filter((movie) => movie.mediaType === "movie"),
      used,
      generatedAt,
      { allowReuse: true },
    ),
  );
  push(
    section(
      "tiktok-trending-dramas",
      "TikTokで話題のドラマ",
      "公開投稿の再生数・反応率・新しさから、いま口コミが動いているドラマ",
      socialCandidates.filter((movie) => movie.mediaType === "tv"),
      used,
      generatedAt,
      { allowReuse: true },
    ),
  );

  push(
    section(
      "now-playing-movies",
      "上映中の映画",
      "日本の劇場で上映中と確認できた映画",
      rank(
        enrichedPool.filter((movie) => isNowPlayingTitle(movie, now)),
        (movie) => theatricalScore(movie, now),
      ),
      used,
      generatedAt,
      { allowReuse: true },
    ),
  );
  push(
    section(
      "trending-movies",
      "今週の話題映画",
      "TMDBの週間映画トレンドから、評価の信頼度も加味して選定",
      rank(
        enrichedPool.filter(
          (movie) => movie.mediaType === "movie" && isFreshTrend(movie, now),
        ),
        (movie) => trendScore(movie, now),
      ),
      used,
      generatedAt,
      { allowReuse: true },
    ),
  );
  push(
    section(
      "trending-dramas",
      "今週の話題ドラマ",
      "TMDBの週間ドラマトレンドから、評価の信頼度も加味して選定",
      rank(
        enrichedPool.filter(
          (movie) => movie.mediaType === "tv" && isFreshTrend(movie, now),
        ),
        (movie) => trendScore(movie, now),
      ),
      used,
      generatedAt,
      { allowReuse: true },
    ),
  );
  push(
    section(
      "editorial-movies",
      "編集部おすすめ映画",
      "編集部がコメント付きで選んだ映画",
      editorial
        .filter((movie) => movie.mediaType === "movie")
        .map((movie) => byId.get(movie.id) ?? movie),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "editorial-dramas",
      "編集部おすすめドラマ",
      "編集部がコメント付きで選んだドラマ",
      editorial
        .filter((movie) => movie.mediaType === "tv")
        .map((movie) => byId.get(movie.id) ?? movie),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "recent-movies",
      "新作映画",
      "直近公開の映画から、票数と評価を満たす作品を選定",
      rank(
        enrichedPool.filter(
          (movie) => movie.mediaType === "movie" && isRecentTitle(movie, now),
        ),
        (movie) => recentScore(movie, now),
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "recent-dramas",
      "新作ドラマ",
      "直近配信のドラマから、票数と評価を満たす作品を選定",
      rank(
        enrichedPool.filter(
          (movie) => movie.mediaType === "tv" && isRecentTitle(movie, now),
        ),
        (movie) => recentScore(movie, now),
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "evergreen-movies",
      "不動の人気映画",
      "長く支持されている高評価映画を、票数補正付きで選定",
      rank(
        enrichedPool.filter(
          (movie) =>
            movie.mediaType === "movie" && isEvergreenTitle(movie, now),
        ),
        evergreenScore,
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "evergreen-dramas",
      "不動の人気ドラマ",
      "長く支持されている高評価ドラマを、票数補正付きで選定",
      rank(
        enrichedPool.filter(
          (movie) => movie.mediaType === "tv" && isEvergreenTitle(movie, now),
        ),
        evergreenScore,
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "streaming-movies",
      "配信中の映画",
      "日本で見放題配信を確認できた映画",
      rank(
        enrichedPool.filter(
          (movie) =>
            movie.mediaType === "movie" &&
            movie.providers.some((provider) => provider.type === "flatrate"),
        ),
        (movie) => discoveryScore(movie, now),
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "streaming-dramas",
      "配信中のドラマ",
      "日本で見放題配信を確認できたドラマ",
      rank(
        enrichedPool.filter(
          (movie) =>
            movie.mediaType === "tv" &&
            movie.providers.some((provider) => provider.type === "flatrate"),
        ),
        (movie) => discoveryScore(movie, now),
      ),
      used,
      generatedAt,
    ),
  );
  if (Math.max(0, ...saveCount.values()) >= 20) {
    push(
      section(
        "most-saved",
        "KIBUNで人気の映画・ドラマ",
        "20件以上お気に入り・見たいに保存された作品（種別を明記）",
        [...saveCount.entries()]
          .filter(([, count]) => count >= 20)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .flatMap(([id]) => (byId.has(id) ? [byId.get(id)!] : [])),
        used,
        generatedAt,
      ),
    );
  }
  if (user) {
    push(
      section(
        "unseen",
        "まだ見ていない映画・ドラマ",
        "視聴済みを除外した候補（種別を明記）",
        rank(
          enrichedPool.filter((movie) => !watchedIds.has(movie.id)),
          (movie) => discoveryScore(movie, now),
        ),
        used,
        generatedAt,
      ),
    );
  }

  // Top video feed: the latest trends first, alternated with taste picks
  // when the viewer has signals.
  const byMomentum = (movies: Movie[]) =>
    [...movies].sort(
      (a, b) =>
        trendMomentum(b, now) - trendMomentum(a, now) ||
        a.id.localeCompare(b.id),
    );
  return {
    sections: prioritizeHomeFeedSections(sections, {
      limit: 64,
      rankVideos: profile
        ? (movies) =>
            interleaveForDiscovery(
              blendWithInterest(
                movies,
                (movie) => trendMomentum(movie, now),
                affinity,
                0.6,
              ),
              byMomentum(movies),
            )
        : byMomentum,
    }).map((rail) => ({ ...rail, movies: rail.movies.map(toFeedMovie) })),
    personalized: recommendationResult.personalized,
    generatedAt,
  };
}
