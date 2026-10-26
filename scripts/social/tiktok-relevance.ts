import type { TikTokSearchPost } from "./tiktok-client.js";

export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function titleHashtags(title: string, aliases: string[] = []): string[] {
  return [...new Set([title, ...aliases].map(normalizeTitle).filter(Boolean))];
}

export function matchesTikTokTargetRegion(
  post: Pick<TikTokSearchPost, "regionCode">,
  targetRegion = "JP",
): boolean {
  return (
    !post.regionCode ||
    post.regionCode.toUpperCase() === targetRegion.toUpperCase()
  );
}

// "タイトル2", "タイトル シーズン2", "title s2" and similar point at a later
// season, while counters such as "2回目" or "2話" still refer to this one.
const SEQUEL_SUFFIX =
  /^(?:(?:シーズン|season|s|part|パート|第)?([2-9])(?![0-9回話人年日時分周度])|([2-9])期|(iii|ii|続編))/;

function sequelAfter(rest: string): string | null {
  const match = SEQUEL_SUFFIX.exec(rest);
  if (!match) return null;
  const roman = match[3];
  return (
    match[1] ??
    match[2] ??
    (roman === "ii" ? "2" : roman === "iii" ? "3" : "sequel")
  );
}

// Matches a title only when the season named in the text is the same one:
// the base title must not be followed by a later season, and a title ending
// in a season number also matches other ways of writing that number.
function mentionsSameSeason(text: string, candidate: string): boolean {
  const numbered = /^(.{3,}?)([2-9])$/.exec(candidate);
  const base = numbered ? numbered[1] : candidate;
  const season = numbered ? numbered[2] : null;
  for (
    let index = text.indexOf(base);
    index !== -1;
    index = text.indexOf(base, index + 1)
  ) {
    const rest = normalizeTitle(
      text.slice(index + base.length, index + base.length + 12),
    );
    if (sequelAfter(rest) === season) return true;
  }
  return false;
}

export function scoreTikTokTitleRelevance(
  post: Pick<TikTokSearchPost, "caption" | "hashtags">,
  title: string,
  aliases: string[] = [],
): number {
  const candidates = titleHashtags(title, aliases);
  const caption = normalizeTitle(post.caption);
  const hashtags = new Set(post.hashtags.map(normalizeTitle));
  let score = 0;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (hashtags.has(candidate)) score = Math.max(score, 1);
    if (candidate.length >= 3 && mentionsSameSeason(caption, candidate)) {
      score = Math.max(score, candidate.length >= 5 ? 0.9 : 0.72);
    }
    if (mentionsSameSeason(post.caption, `#${candidate}`)) {
      score = Math.max(score, 0.95);
    }
  }
  return score;
}
