import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCatalogMovies, type CatalogMovie } from "@/lib/movies/catalog";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import { loadRecommendations } from "@/lib/recommendations/server";
import type { Movie, MovieRail } from "@/types/movie";

type SavedRow = { movie_id: string; save_count: number | string };

function timestamp(value?: string): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableSort(
  movies: CatalogMovie[],
  score: (movie: CatalogMovie) => number,
) {
  return [...movies].sort(
    (a, b) => score(b) - score(a) || a.id.localeCompare(b.id),
  );
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
  const [pool, editorial, recommendationResult, savedResult] =
    await Promise.all([
      loadCatalogMovies(supabase, { limit: 72, requireVideo: true }),
      loadEditorialMovies(supabase, { limit: 8 }).catch(() => []),
      user
        ? loadRecommendations(supabase, { limit: 16 }).catch(() => ({
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
  const day = 86_400_000;
  const releaseStart = now.getTime() - 45 * day;
  const releaseEnd = now.getTime() + 120 * day;
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
      "theatrical",
      "劇場公開中・近日公開",
      "公開日が前後45日〜120日の作品",
      stableSort(
        enrichedPool.filter((movie) => {
          const release = timestamp(movie.releaseDate);
          return release >= releaseStart && release <= releaseEnd;
        }),
        (movie) => timestamp(movie.releaseDate) + movie.popularity * 1_000,
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "recent",
      "最近追加",
      "データベースへ最近追加・更新された作品",
      stableSort(enrichedPool, (movie) =>
        timestamp(movie.lastSyncedAt ?? movie.createdAt),
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
        (movie) => movie.popularity,
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "trending",
      "話題",
      "TMDB人気度をもとに毎回同じ順序で生成",
      stableSort(enrichedPool, (movie) => movie.popularity),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "high-rated",
      "高評価",
      "100票以上かつ評価7.5以上の作品",
      stableSort(
        enrichedPool.filter(
          (movie) => movie.voteCount >= 100 && movie.voteAverage >= 7.5,
        ),
        (movie) => movie.voteAverage * 10_000 + movie.voteCount,
      ),
      used,
      generatedAt,
    ),
  );
  push(
    section(
      "most-saved",
      "保存数が多い",
      "KIBUNでお気に入り・見たいに保存された作品",
      [...saveCount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .flatMap(([id]) => (byId.has(id) ? [byId.get(id)!] : [])),
      used,
      generatedAt,
    ),
  );
  if (user) {
    push(
      section(
        "unseen",
        "まだ見ていない作品",
        "視聴済みを除外した候補",
        stableSort(
          enrichedPool.filter((movie) => !watchedIds.has(movie.id)),
          (movie) => movie.popularity + movie.voteAverage,
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
