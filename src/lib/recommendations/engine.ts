import type { Movie } from "@/types/movie";
import {
  discoveryScore,
  isRecommendationEligible,
} from "@/lib/discovery/ranking";

export type RecommendationInteraction = {
  movie: Movie;
  status: "WATCHED" | "WATCHLIST" | "NONE";
  isFavorite: boolean;
  rating: number | null;
  weight?: number;
  exclude?: boolean;
};

export type RecommendationPreferences = {
  enabled: boolean;
  genres: string[];
  emotions: string[];
};

export type PreferenceProfile = {
  genres: Map<string, number>;
  emotions: Map<string, number>;
  countries: Map<string, number>;
  directors: Map<number, { name: string; weight: number }>;
  cast: Map<number, { name: string; weight: number }>;
  excludedMovieIds: Set<string>;
};

function add(map: Map<string, number>, value: string, weight: number) {
  if (value) map.set(value, (map.get(value) ?? 0) + weight);
}

function signalWeight(interaction: RecommendationInteraction): number {
  if (interaction.weight !== undefined) return interaction.weight;
  return (
    (interaction.isFavorite ? 5 : 0) +
    (interaction.status === "WATCHLIST" ? 3 : 0) +
    (interaction.status === "WATCHED" ? 1 : 0) +
    Math.max(0, (interaction.rating ?? 0) - 2) * 2
  );
}

export function buildPreferenceProfile(
  interactions: RecommendationInteraction[],
  preferences: RecommendationPreferences,
  seedMovie?: Movie,
): PreferenceProfile {
  const profile: PreferenceProfile = {
    genres: new Map(),
    emotions: new Map(),
    countries: new Map(),
    directors: new Map(),
    cast: new Map(),
    excludedMovieIds: new Set(),
  };

  for (const genre of preferences.genres) add(profile.genres, genre, 4);
  for (const emotion of preferences.emotions) add(profile.emotions, emotion, 5);

  const signals = seedMovie
    ? [
        {
          movie: seedMovie,
          status: "NONE" as const,
          isFavorite: true,
          rating: 5,
        },
      ]
    : interactions;

  for (const interaction of signals) {
    const weight = signalWeight(interaction);
    if (weight <= 0) continue;
    if (interaction.exclude !== false) {
      profile.excludedMovieIds.add(interaction.movie.id);
    }
    for (const genre of interaction.movie.genres)
      add(profile.genres, genre, weight);
    for (const emotion of interaction.movie.emotionalTags) {
      const intensity = interaction.movie.emotionScores?.[emotion] ?? 0.7;
      add(profile.emotions, emotion, weight * intensity);
    }
    for (const country of interaction.movie.originCountries ?? []) {
      add(profile.countries, country, weight * 0.6);
    }
    for (const director of interaction.movie.directors ?? []) {
      const current = profile.directors.get(director.id);
      profile.directors.set(director.id, {
        name: director.name,
        weight: (current?.weight ?? 0) + weight * 0.9,
      });
    }
    for (const actor of (interaction.movie.cast ?? []).slice(0, 8)) {
      const current = profile.cast.get(actor.id);
      profile.cast.set(actor.id, {
        name: actor.name,
        weight: (current?.weight ?? 0) + weight * 0.35,
      });
    }
  }

  for (const interaction of interactions) {
    if (interaction.status === "WATCHED") {
      profile.excludedMovieIds.add(interaction.movie.id);
    }
  }
  return profile;
}

// How strongly a title matches the viewer's taste, independent of how
// popular or trending it is.
export function interestAffinity(
  movie: Movie,
  profile: PreferenceProfile,
): { score: number; reason?: string } {
  let score = 0;
  const reasons: Array<{ label: string; weight: number }> = [];

  for (const genre of movie.genres) {
    const weight = profile.genres.get(genre) ?? 0;
    score += weight * 2.6;
    if (weight) reasons.push({ label: `好きな${genre}に近い`, weight });
  }
  for (const emotion of movie.emotionalTags) {
    const weight = profile.emotions.get(emotion) ?? 0;
    const intensity = movie.emotionScores?.[emotion] ?? 0.7;
    score += weight * intensity * 3.2;
    if (weight) reasons.push({ label: `「${emotion}」の気分に合う`, weight });
  }
  for (const country of movie.originCountries ?? []) {
    const weight = profile.countries.get(country) ?? 0;
    score += weight * 1.4;
    if (weight) reasons.push({ label: `${country}作品の好みから`, weight });
  }
  for (const director of movie.directors ?? []) {
    const signal = profile.directors.get(director.id);
    if (!signal) continue;
    score += signal.weight * 2.2;
    reasons.push({
      label: `${director.name}監督の作品`,
      weight: signal.weight,
    });
  }
  for (const actor of (movie.cast ?? []).slice(0, 8)) {
    const signal = profile.cast.get(actor.id);
    if (!signal) continue;
    score += signal.weight;
    reasons.push({ label: `${actor.name}出演`, weight: signal.weight });
  }

  return {
    score,
    reason: reasons.sort((a, b) => b.weight - a.weight)[0]?.label,
  };
}

function recommendationScore(
  movie: Movie,
  profile: PreferenceProfile,
  now: Date,
) {
  const affinity = interestAffinity(movie, profile);
  return {
    movie,
    score: discoveryScore(movie, now) + affinity.score,
    reason: affinity.reason ?? "人気と評価からおすすめ",
  };
}

// Ranks titles by blending their position in a section's own ordering
// (trend, freshness, rating...) with the viewer's interest. Percentile ranks
// keep the two scales comparable whatever each section scores with.
export function blendWithInterest<T extends Movie>(
  movies: T[],
  baseScore: (movie: T) => number,
  affinity: ReadonlyMap<string, number>,
  interestWeight = 0.4,
): T[] {
  if (movies.length < 2) return [...movies];
  const byBase = [...movies].sort(
    (a, b) => baseScore(b) - baseScore(a) || a.id.localeCompare(b.id),
  );
  const basePercentile = new Map(
    byBase.map((movie, index) => [movie.id, 1 - index / (byBase.length - 1)]),
  );
  const maxAffinity = Math.max(
    0,
    ...movies.map((movie) => affinity.get(movie.id) ?? 0),
  );
  const blended = (movie: T) =>
    (1 - interestWeight) * (basePercentile.get(movie.id) ?? 0) +
    interestWeight *
      (maxAffinity > 0 ? (affinity.get(movie.id) ?? 0) / maxAffinity : 0);
  return byBase.sort(
    (a, b) => blended(b) - blended(a) || a.id.localeCompare(b.id),
  );
}

// Alternates titles picked for the viewer with what is trending for
// everyone, so the feed follows taste without closing off discovery.
export function interleaveForDiscovery<T extends { id: string }>(
  personal: T[],
  trending: T[],
  pattern: Array<"personal" | "trending"> = [
    "personal",
    "personal",
    "trending",
  ],
): T[] {
  const queues = { personal: [...personal], trending: [...trending] };
  const seen = new Set<string>();
  const result: T[] = [];
  const take = (kind: "personal" | "trending") => {
    const queue = queues[kind];
    while (queue.length) {
      const movie = queue.shift()!;
      if (seen.has(movie.id)) continue;
      seen.add(movie.id);
      result.push(movie);
      return true;
    }
    return false;
  };
  for (let step = 0; queues.personal.length || queues.trending.length; step++) {
    const kind = pattern[step % pattern.length];
    if (!take(kind)) take(kind === "personal" ? "trending" : "personal");
  }
  return result;
}

export function recommendMovies(
  candidates: Movie[],
  profile: PreferenceProfile,
  options?: { limit?: number; now?: Date },
): Movie[] {
  const limit = Math.min(Math.max(options?.limit ?? 18, 1), 40);
  const now = options?.now ?? new Date();
  const ranked = candidates
    .filter(
      (movie) =>
        !profile.excludedMovieIds.has(movie.id) &&
        isRecommendationEligible(movie, now),
    )
    .map((movie) => recommendationScore(movie, profile, now))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.movie.voteAverage - a.movie.voteAverage ||
        a.movie.id.localeCompare(b.movie.id),
    );

  const results: Movie[] = [];
  const genreCounts = new Map<string, number>();
  const collectionIds = new Set<number>();
  for (const candidate of ranked) {
    const primaryGenre = candidate.movie.genres[0] ?? "その他";
    if ((genreCounts.get(primaryGenre) ?? 0) >= 3) continue;
    if (
      candidate.movie.collectionId &&
      collectionIds.has(candidate.movie.collectionId)
    ) {
      continue;
    }
    results.push({
      ...candidate.movie,
      recommendationReason: candidate.reason,
      matchReasons: [candidate.reason],
    });
    genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) ?? 0) + 1);
    if (candidate.movie.collectionId) {
      collectionIds.add(candidate.movie.collectionId);
    }
    if (results.length >= limit) break;
  }
  return results;
}
