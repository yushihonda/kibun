import type { Movie } from "@/types/movie";

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

function recommendationScore(movie: Movie, profile: PreferenceProfile) {
  let score = movie.voteAverage * 0.35 + Math.log10(movie.popularity + 1) * 0.5;
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

  const reason = reasons.sort((a, b) => b.weight - a.weight)[0]?.label;
  return { movie, score, reason: reason ?? "人気と評価からおすすめ" };
}

export function recommendMovies(
  candidates: Movie[],
  profile: PreferenceProfile,
  options?: { limit?: number },
): Movie[] {
  const limit = Math.min(Math.max(options?.limit ?? 18, 1), 40);
  const ranked = candidates
    .filter((movie) => !profile.excludedMovieIds.has(movie.id))
    .map((movie) => recommendationScore(movie, profile))
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
