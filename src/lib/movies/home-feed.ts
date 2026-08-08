import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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
  trendScore,
} from "@/lib/discovery/ranking";
import { loadCatalogMovies, type CatalogMovie } from "@/lib/movies/catalog";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import { loadRecommendations } from "@/lib/recommendations/server";
import type { Movie, MovieRail } from "@/types/movie";

type SavedRow = { movie_id: string; save_count: number | string };

function stableSort(
  movies: CatalogMovie[],
  score: (movie: CatalogMovie) => number,
) {
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
  options?: { now?: Date },
): Promise<{
  sections: MovieRail[];
  personalized: boolean;
  generatedAt: string;
}> {
  const now = options?.now ?? new Date();
  const generatedAt = now.toISOString();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user;
  const trendingSince = new Date(now.getTime() - 10 * 86_400_000).toISOString();
  const theatricalSince = new Date(
    now.getTime() - 4 * 86_400_000,
  ).toISOString();
  const [
    popularPool,
    provenPool,
    weeklyPool,
    theatricalPool,
    editorial,
    recommendationResult,
    savedResult,
    socialResult,
  ] = await Promise.all([
    loadCatalogMovies(supabase, { limit: 240, orderBy: "popularity" }),
    loadCatalogMovies(supabase, { limit: 200, orderBy: "vote_count" }),
    loadCatalogMovies(supabase, {
      limit: 120,
      orderBy: "trending_at",
      trendingSince,
    }),
    loadCatalogMovies(supabase, {
      limit: 80,
      orderBy: "theatrical_at",
      theatricalSince,
    }),
    loadEditorialMovies(supabase, { limit: 8 }).catch(() => []),
    user
      ? loadRecommendations(supabase, { limit: 16, now }).catch(() => ({
          movies: [],
          personalized: false,
          personalizationEnabled: true,
          onboardingCompleted: false,
          signalCount: 0,
        }))
      : Promise.resolve({
          movies: [],
          personalized: false,
          personalizationEnabled: true,
          onboardingCompleted: false,
          signalCount: 0,
        }),
    supabase.rpc("most_saved_movies", { p_limit: 60 }),
    supabase
      .from("movie_social_signals")
      .select("movie_id,trend_score")
      .gte(
        "calculated_at",
        new Date(now.getTime() - 30 * 86_400_000).toISOString(),
      )
      .order("trend_score", { ascending: false })
      .limit(60),
  ]);
  const socialMovieIds = (socialResult.data ?? []).map((row) =>
    String(row.movie_id),
  );
  const socialPool = socialMovieIds.length
    ? await loadCatalogMovies(supabase, {
        limit: socialMovieIds.length,
        movieIds: socialMovieIds,
      })
    : [];
  const pool = uniqueMovies([
    socialPool,
    theatricalPool,
    weeklyPool,
    popularPool,
    provenPool,
  ]);
  const watchedIds = new Set<string>();
  if (user) {
    const { data } = await supabase
      .from("user_movie_interactions")
      .select("movie_id")
      .eq("user_id", user.id)
      .eq("status", "WATCHED");
    for (const row of data ?? []) watchedIds.add(String(row.movie_id));
  }

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

  const socialCandidates = stableSort(
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
      stableSort(
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
      stableSort(
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
      stableSort(
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
      stableSort(
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
      stableSort(
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
      stableSort(
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
      stableSort(
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
      stableSort(
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
      stableSort(
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
        stableSort(
          enrichedPool.filter((movie) => !watchedIds.has(movie.id)),
          (movie) => discoveryScore(movie, now),
        ),
        used,
        generatedAt,
      ),
    );
  }

  return {
    sections,
    personalized: recommendationResult.personalized,
    generatedAt,
  };
}
