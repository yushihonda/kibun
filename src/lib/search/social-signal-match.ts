import type { MovieSocialSignals } from "@/types/movie";

type SocialSignalSearchInput = Pick<
  MovieSocialSignals,
  "topHashtags" | "topics" | "latestPostAt" | "updatedAt"
>;

export type SocialSignalMatch = {
  kind: "hashtag" | "topic";
  term: string;
  score: number;
};

const SOCIAL_SIGNAL_MAX_AGE_DAYS = 120;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const socialSearchNoise = new Set([
  "fyp",
  "foryou",
  "foryoupage",
  "tiktok",
  "ティックトック",
  "viral",
  "trend",
  "trending",
  "バズ",
  "バズる",
  "おすすめ",
  "オススメ",
  "recommend",
  "映画",
  "映画紹介",
  "映画好き",
  "ドラマ",
  "ドラマ紹介",
  "ドラマ好き",
  "邦画",
  "洋画",
  "日本",
  "japan",
  "jp",
]);

export function normalizeSocialSearchTerm(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ja")
    .replace(/[#＃\s._・･/\\-]+/gu, "");
}

function length(value: string): number {
  return Array.from(value).length;
}

function bigrams(value: string): string[] {
  const characters = Array.from(value);
  return characters.slice(0, -1).map((character, index) => {
    return `${character}${characters[index + 1]}`;
  });
}

function diceSimilarity(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (!leftBigrams.length || !rightBigrams.length) return 0;

  const remaining = new Map<string, number>();
  for (const bigram of rightBigrams) {
    remaining.set(bigram, (remaining.get(bigram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const bigram of leftBigrams) {
    const count = remaining.get(bigram) ?? 0;
    if (count > 0) {
      overlap += 1;
      remaining.set(bigram, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function termMatchStrength(query: string, term: string): number {
  const queryLength = length(query);
  const termLength = length(term);
  if (query === term) return Math.min(queryLength >= 3 ? 1 : 0.8, 1);

  if (queryLength >= 3 && termLength >= 3) {
    if (query.includes(term)) return 0.88;
    if (term.includes(query)) return 0.78;
  }

  if (queryLength < 4 || termLength < 4) return 0;
  const similarity = diceSimilarity(query, term);
  return similarity >= 0.5 ? 0.55 + similarity * 0.45 : 0;
}

function freshnessMultiplier(signals: SocialSignalSearchInput, now: Date) {
  const timestamp = signals.latestPostAt ?? signals.updatedAt;
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return 0;
  const ageDays = Math.max(0, (now.getTime() - time) / DAY_IN_MILLISECONDS);
  if (ageDays > SOCIAL_SIGNAL_MAX_AGE_DAYS) return 0;
  if (ageDays <= 14) return 1;
  if (ageDays <= 45) return 0.9;
  return 0.75;
}

export function findSocialSignalMatch(
  query: string,
  signals: SocialSignalSearchInput | undefined,
  now = new Date(),
): SocialSignalMatch | null {
  if (!signals) return null;
  const normalizedQuery = normalizeSocialSearchTerm(query);
  if (length(normalizedQuery) < 2 || socialSearchNoise.has(normalizedQuery)) {
    return null;
  }

  const freshness = freshnessMultiplier(signals, now);
  if (freshness === 0) return null;

  let best: SocialSignalMatch | null = null;
  const groups = [
    { kind: "hashtag" as const, terms: signals.topHashtags, weight: 1 },
    { kind: "topic" as const, terms: signals.topics, weight: 0.9 },
  ];

  for (const { kind, terms, weight } of groups) {
    terms.slice(0, 8).forEach((rawTerm, index) => {
      const term = normalizeSocialSearchTerm(rawTerm);
      if (length(term) < 2 || socialSearchNoise.has(term)) return;

      const strength = termMatchStrength(normalizedQuery, term);
      if (strength === 0) return;
      // Aggregation orders these terms by frequency, so earlier terms carry a
      // small co-occurrence/frequency advantage without dominating title rank.
      const positionWeight = Math.max(0.72, 1 - index * 0.04);
      const score = strength * weight * positionWeight * freshness;
      if (!best || score > best.score) {
        best = { kind, term: rawTerm.replace(/^[#＃]+/u, ""), score };
      }
    });
  }

  return best;
}

export function socialSignalMatchReason(match: SocialSignalMatch): string {
  return match.kind === "hashtag"
    ? `TikTokの「#${match.term}」に一致`
    : `TikTokの話題「${match.term}」に一致`;
}
