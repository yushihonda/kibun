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
    if (candidate.length >= 3 && caption.includes(candidate)) {
      score = Math.max(score, candidate.length >= 5 ? 0.9 : 0.72);
    }
    if (post.caption.includes(`#${candidate}`)) {
      score = Math.max(score, 0.95);
    }
  }
  return score;
}
