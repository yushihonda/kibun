import {
  isHighConfidenceRating,
  weightedRating,
} from "@/lib/discovery/ranking";
import type { SearchPlan } from "@/lib/search/query-intent";
import type { Movie, MovieRail } from "@/types/movie";

const MAX_PER_RAIL = 18;

function uniqueById(movies: Movie[]): Movie[] {
  const seen = new Set<string>();
  return movies.filter((movie) => {
    if (seen.has(movie.id)) return false;
    seen.add(movie.id);
    return true;
  });
}

function takeRail(
  id: string,
  title: string,
  movies: Movie[],
  used: Set<string>,
  options?: { allowReuse?: boolean; minCount?: number },
): MovieRail | null {
  const allowReuse = options?.allowReuse ?? false;
  const minCount = options?.minCount ?? 1;
  const selected = movies.filter((movie) => allowReuse || !used.has(movie.id));
  if (selected.length < minCount) return null;
  const slice = selected.slice(0, MAX_PER_RAIL);
  if (!allowReuse) {
    for (const movie of slice) used.add(movie.id);
  }
  return { id, title, movies: slice };
}

export function buildSearchRails(
  movies: Movie[],
  plan: SearchPlan | null,
  options?: {
    editorialMovies?: Movie[];
    emptyQuery?: boolean;
  },
): MovieRail[] {
  const rails: MovieRail[] = [];
  const used = new Set<string>();
  const pool = uniqueById(movies);
  const emptyQuery = options?.emptyQuery ?? false;

  const editorialSource = options?.editorialMovies?.length
    ? uniqueById(options.editorialMovies)
    : pool.filter((movie) => Boolean(movie.editorialComment));
  const editorialRail = takeRail(
    "editorial",
    "編集部のおすすめ",
    editorialSource,
    used,
  );
  if (editorialRail) {
    rails.push(editorialRail);
  }

  if (plan?.expanded) {
    const moodTitle = plan.labels.find(
      (label) => !/分以内|高評価|おすすめ|邦画|韓国/.test(label),
    );
    if (moodTitle) {
      const moodMovies = pool.filter(
        (movie) =>
          movie.matchReasons?.some(
            (reason) => reason.includes("気分") || reason === moodTitle,
          ) ||
          movie.emotionalTags.some((tag) =>
            plan.preferredEmotionalTags.some((preferred) =>
              tag.includes(preferred),
            ),
          ) ||
          movie.genres.some((genre) => (plan.preferredGenres[genre] ?? 0) >= 2),
      );
      const moodRail = takeRail(
        "mood",
        `この気分に近い · ${moodTitle}`,
        moodMovies.length ? moodMovies : pool,
        used,
      );
      if (moodRail) rails.push(moodRail);
    }
  }

  const movieRail = takeRail(
    "movies",
    "映画",
    pool.filter((movie) => movie.mediaType === "movie"),
    used,
    { allowReuse: true },
  );
  if (movieRail) rails.push(movieRail);

  const dramaRail = takeRail(
    "dramas",
    "ドラマ",
    pool.filter((movie) => movie.mediaType === "tv"),
    used,
    { allowReuse: true },
  );
  if (dramaRail) rails.push(dramaRail);

  if (plan?.inferredOriginCountries.includes("JP")) {
    const japaneseRail = takeRail("japan", "邦画ピック", pool, used, {
      allowReuse: true,
      minCount: 2,
    });
    if (japaneseRail) rails.push(japaneseRail);
  }

  if (plan?.inferredOriginCountries.includes("KR")) {
    const koreanRail = takeRail("korea", "韓国作品ピック", pool, used, {
      allowReuse: true,
      minCount: 2,
    });
    if (koreanRail) rails.push(koreanRail);
  }

  const highRated = [...pool]
    .filter(isHighConfidenceRating)
    .sort(
      (a, b) =>
        weightedRating(b) - weightedRating(a) || b.popularity - a.popularity,
    );
  const highRatedRail = takeRail("high-rated", "高評価", highRated, used);
  if (highRatedRail) rails.push(highRatedRail);

  const streaming = pool.filter((movie) =>
    movie.providers.some((provider) => provider.type === "flatrate"),
  );
  const streamingRail = takeRail("streaming", "今すぐ見放題", streaming, used);
  if (streamingRail) rails.push(streamingRail);

  if (emptyQuery) {
    const moodGroups: Array<{ id: string; title: string; tags: string[] }> = [
      {
        id: "cry",
        title: "泣ける・切ない",
        tags: ["泣ける", "切ない", "感動", "エモい"],
      },
      {
        id: "laugh",
        title: "笑える・気楽",
        tags: ["笑える", "気楽", "テンポが良い"],
      },
      {
        id: "comfort",
        title: "癒やし・ほっこり",
        tags: ["癒やし", "ほっこり", "心が整う", "チルい"],
      },
      {
        id: "refresh",
        title: "スカッと・爽快",
        tags: ["スカッとする", "爽快", "爆音推奨"],
      },
    ];
    for (const group of moodGroups) {
      const groupMovies = pool.filter((movie) =>
        movie.emotionalTags.some((tag) =>
          group.tags.some((preferred) => tag.includes(preferred)),
        ),
      );
      const rail = takeRail(group.id, group.title, groupMovies, used, {
        allowReuse: true,
      });
      if (rail) rails.push(rail);
    }
  }

  const remaining = pool.filter((movie) => !used.has(movie.id));
  if (remaining.length || rails.length === 0) {
    const moreRail = takeRail(
      "more",
      rails.length ? "その他の候補" : "おすすめ",
      remaining.length ? remaining : pool,
      used,
      { allowReuse: true },
    );
    if (moreRail) rails.push(moreRail);
  }

  return rails.filter((rail) => rail.movies.length > 0);
}
