import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  discoveryScore,
  evergreenScore,
  isEvergreenTitle,
  isFreshTrend,
  isRecentTitle,
  recentScore,
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
): MovieRail | null {
  const movies = candidates.filter((movie) => !used.has(movie.id)).slice(0, 8);
  if (!movies.length) return null;
  for (const movie of movies) used.add(movie.id);
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
  const [
    popularPool,
    provenPool,
    weeklyPool,
    editorial,
    recommendationResult,
    savedResult,
  ] = await Promise.all([
    loadCatalogMovies(supabase, { limit: 240, orderBy: "popularity" }),
    loadCatalogMovies(supabase, { limit: 200, orderBy: "vote_count" }),
    loadCatalogMovies(supabase, {
      limit: 120,
      orderBy: "trending_at",
      trendingSince,
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
  ]);
  const pool = uniqueMovies([weeklyPool, popularPool, provenPool]);
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
        "for-you",
        "あなたへのおすすめ",
        "映画棚と好みをもとにした未視聴作品",
        recommendationResult.movies.slice(0, 8),
        used,
        generatedAt,
      ),
    );
    if (recommendationResult.signalCount >= 3) {
      push(
        section(
          "similar-favorites",
          "お気に入りに似た作品",
          "ジャンル・気分・監督・出演者の共通点から選定",
          recommendationResult.movies.slice(8),
          used,
          generatedAt,
        ),
      );
    }
  }

  push(
    section(
      "trending",
      "今週の話題",
      "TMDBの週間トレンドから、評価の信頼度も加味して選定",
      stableSort(
        enrichedPool.filter((movie) => isFreshTrend(movie, now)),
        (movie) => trendScore(movie, now),
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "editorial",
      "編集部のおすすめ",
      "編集部がコメント付きで選んだ作品",
      editorial.map((movie) => byId.get(movie.id) ?? movie),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "recent",
      "新作映画・放送中ドラマ",
      "直近の公開・配信作品から、票数と評価を満たす作品を選定",
      stableSort(
        enrichedPool.filter((movie) => isRecentTitle(movie, now)),
        (movie) => recentScore(movie, now),
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "evergreen",
      "不動の人気",
      "長く支持されている高評価作品を、票数補正付きで選定",
      stableSort(
        enrichedPool.filter((movie) => isEvergreenTitle(movie, now)),
        evergreenScore,
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "streaming",
      "配信中",
      "日本で見放題配信を確認できた作品",
      stableSort(
        enrichedPool.filter((movie) =>
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
        "KIBUNで人気",
        "KIBUNで20件以上お気に入り・見たいに保存された作品",
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
        "まだ見ていない作品",
        "視聴済みを除外した候補",
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
