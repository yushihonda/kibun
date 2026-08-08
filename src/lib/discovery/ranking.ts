import type { Movie } from "@/types/movie";

const DAY_MS = 86_400_000;
const RATING_PRIOR = 6.5;
export const SOCIAL_TREND_MAX_AGE_DAYS = 30;

function dateValue(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function voteCount(movie: Movie): number {
  return Math.max(0, movie.voteCount ?? 0);
}

function voteFloor(movie: Movie, movieFloor: number, tvFloor: number) {
  return movie.mediaType === "tv" ? tvFloor : movieFloor;
}

function releaseAgeDays(movie: Movie, now: Date): number | null {
  const release = dateValue(movie.releaseDate);
  return release === null ? null : (now.getTime() - release) / DAY_MS;
}

export function weightedRating(movie: Movie): number {
  const votes = voteCount(movie);
  const confidenceVotes = voteFloor(movie, 1_000, 500);
  return (
    (votes / (votes + confidenceVotes)) * movie.voteAverage +
    (confidenceVotes / (votes + confidenceVotes)) * RATING_PRIOR
  );
}

export function isFreshTrend(movie: Movie, now = new Date()): boolean {
  const trendingAt = dateValue(movie.trendingAt);
  if (trendingAt === null) return false;
  const age = now.getTime() - trendingAt;
  if (age < -DAY_MS || age > 10 * DAY_MS) return false;

  const releaseAge = releaseAgeDays(movie, now);
  const anticipated =
    releaseAge !== null &&
    releaseAge < 0 &&
    releaseAge >= -90 &&
    movie.popularity >= 80;
  return (
    anticipated ||
    (movie.voteAverage >= 6 && voteCount(movie) >= voteFloor(movie, 40, 20))
  );
}

export function isRecentTitle(movie: Movie, now = new Date()): boolean {
  const age = releaseAgeDays(movie, now);
  if (age === null || age < -45 || age > 180) return false;
  if (age < 0) return isFreshTrend(movie, now) && movie.popularity >= 80;
  return (
    movie.voteAverage >= 6.2 && voteCount(movie) >= voteFloor(movie, 80, 40)
  );
}

export function isNowPlayingTitle(movie: Movie, now = new Date()): boolean {
  if (movie.mediaType !== "movie") return false;
  const theatricalAt = dateValue(movie.theatricalAt);
  if (theatricalAt === null) return false;
  const age = now.getTime() - theatricalAt;
  return age >= -DAY_MS && age <= 4 * DAY_MS;
}

export function isHighConfidenceRating(movie: Movie): boolean {
  return (
    movie.voteAverage >= 7.5 && voteCount(movie) >= voteFloor(movie, 500, 250)
  );
}

export function isEvergreenTitle(movie: Movie, now = new Date()): boolean {
  const age = releaseAgeDays(movie, now);
  return (
    age !== null &&
    age >= 548 &&
    movie.voteAverage >= 7.5 &&
    voteCount(movie) >= voteFloor(movie, 3_000, 1_000)
  );
}

export function discoveryScore(movie: Movie, now = new Date()): number {
  const age = releaseAgeDays(movie, now);
  const recentBonus =
    age !== null && age >= -45 && age <= 180
      ? Math.max(0, 18 - Math.max(age, 0) / 15)
      : 0;
  return (
    weightedRating(movie) * 12 +
    Math.log10(voteCount(movie) + 1) * 4 +
    Math.log10(Math.max(0, movie.popularity) + 1) * 2 +
    (isFreshTrend(movie, now) ? 35 : 0) +
    socialTrendBoost(movie, now) +
    recentBonus
  );
}

export function socialTrendBoost(
  movie: Pick<Movie, "socialSignals">,
  now = new Date(),
): number {
  const social = movie.socialSignals;
  if (!social || social.postCount <= 0) return 0;
  const signalAt = dateValue(social.latestPostAt);
  if (signalAt === null) return 0;
  const ageDays = (now.getTime() - signalAt) / DAY_MS;
  if (ageDays < -1 || ageDays > SOCIAL_TREND_MAX_AGE_DAYS) return 0;
  const freshness = Math.exp(-ageDays / 21);
  return Math.min(24, Math.max(0, social.trendScore) * 0.22) * freshness;
}

export function isFreshSocialTrend(
  movie: Pick<Movie, "socialSignals">,
  now = new Date(),
): boolean {
  return (
    (movie.socialSignals?.postCount ?? 0) >= 1 &&
    (movie.socialSignals?.trendScore ?? 0) >= 20 &&
    socialTrendBoost(movie, now) > 0
  );
}

export function trendScore(movie: Movie, now = new Date()): number {
  const trendingAt = dateValue(movie.trendingAt) ?? 0;
  const trendAge = Math.max(0, now.getTime() - trendingAt) / DAY_MS;
  return discoveryScore(movie, now) + Math.max(0, 10 - trendAge) * 2;
}

export function theatricalScore(movie: Movie, now = new Date()): number {
  const theatricalAt = dateValue(movie.theatricalAt) ?? 0;
  const freshness = Math.max(0, now.getTime() - theatricalAt) / DAY_MS;
  return discoveryScore(movie, now) + Math.max(0, 4 - freshness) * 3;
}

export function recentScore(movie: Movie, now = new Date()): number {
  const age = releaseAgeDays(movie, now) ?? 180;
  return discoveryScore(movie, now) + Math.max(0, 180 - Math.max(age, 0)) / 10;
}

export function evergreenScore(movie: Movie): number {
  return weightedRating(movie) * 20 + Math.log10(voteCount(movie) + 1) * 8;
}

export function isRecommendationEligible(
  movie: Movie,
  now = new Date(),
): boolean {
  if (isFreshTrend(movie, now) || isRecentTitle(movie, now)) return true;
  return (
    movie.voteAverage >= 6.8 && voteCount(movie) >= voteFloor(movie, 200, 100)
  );
}
