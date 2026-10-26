import { createHash } from "node:crypto";
import type {
  EmotionTag,
  MovieRecord,
  ProviderRecord,
  ProviderType,
  TmdbDetails,
  TmdbSource,
} from "./types";
import { selectYouTubeVideo } from "./youtube";
import type { EmotionProfile } from "./emotions";
import { manualMetadataFor } from "./manual-metadata";

const providerTypes: ProviderType[] = ["flatrate", "rent", "buy"];

export function mapTmdbMovie(
  details: TmdbDetails,
  sources: TmdbSource[],
  emotion: EmotionTag[] | EmotionProfile,
  syncedAt: string,
): MovieRecord {
  const emotionProfile: EmotionProfile = Array.isArray(emotion)
    ? {
        tags: emotion,
        scores: Object.fromEntries(emotion.map((tag) => [tag, 0.7])),
        source: emotion.length ? "legacy" : "unclassified",
      }
    : emotion;
  const manual = manualMetadataFor(details.media_type, details.id);
  const title = manual?.title ?? details.title;
  const aliases = [
    ...(title !== details.title ? [details.title] : []),
    ...(details.alternative_titles?.titles ?? []).map((entry) => entry.title),
    ...(manual?.aliases ?? []),
  ]
    .map((alias) => alias.trim())
    .filter(
      (alias, index, items) =>
        alias &&
        alias !== title &&
        alias !== details.original_title &&
        items.indexOf(alias) === index,
    )
    .slice(0, 40);
  const keywords = [
    ...(details.keywords?.keywords ?? []).map((keyword) => keyword.name),
    ...details.genres.map((genre) => genre.name),
  ]
    .map((keyword) => keyword.trim())
    .filter(
      (keyword, index, items) => keyword && items.indexOf(keyword) === index,
    )
    .slice(0, 50);
  const base = {
    tmdb_id: details.id,
    media_type: details.media_type,
    title,
    original_title: details.original_title,
    overview: details.overview,
    release_date: details.release_date || null,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    genres: details.genres,
    runtime_minutes:
      details.runtime !== null && details.runtime > 0 ? details.runtime : null,
    status: details.status,
    tagline: details.tagline,
    homepage: details.homepage,
    imdb_id: details.imdb_id,
    popularity: details.popularity,
    vote_average: details.vote_average,
    vote_count: details.vote_count,
    adult: details.adult,
    original_language: details.original_language ?? "",
    origin_countries: [...new Set(details.origin_country ?? [])].sort(),
    cast: (details.credits?.cast ?? []).slice(0, 20),
    directors: (details.credits?.crew ?? []).filter(
      (credit) =>
        credit.job === "Director" ||
        (details.media_type === "tv" && credit.job === "Creator"),
    ),
    youtube_video_key:
      selectYouTubeVideo(details.videos?.results ?? [])?.key ?? null,
    emotion_tags: emotionProfile.tags,
    emotional_scores: emotionProfile.scores,
    emotion_source: emotionProfile.source,
    emotion_updated_at: syncedAt,
    keywords,
    aliases,
    tmdb_collection_id: details.belongs_to_collection?.id ?? null,
    number_of_seasons: details.number_of_seasons,
    number_of_episodes: details.number_of_episodes,
    sources: [...new Set(sources)].sort() as TmdbSource[],
    trending_at: sources.includes("trending") ? syncedAt : null,
    theatrical_at:
      details.media_type === "movie" && sources.includes("now_playing")
        ? syncedAt
        : null,
  };
  const providerFingerprint = mapJapaneseProviders(details, "").map(
    (provider) => {
      const { last_seen_at: lastSeenAt, ...fingerprint } = provider;
      void lastSeenAt;
      return fingerprint;
    },
  );
  const {
    emotion_updated_at: emotionUpdatedAt,
    trending_at: trendingAt,
    theatrical_at: theatricalAt,
    ...hashBase
  } = base;
  void emotionUpdatedAt;
  void trendingAt;
  void theatricalAt;
  const synced_hash = createHash("sha256")
    .update(JSON.stringify({ ...hashBase, providers: providerFingerprint }))
    .digest("hex");
  return { ...base, synced_hash, last_synced_at: syncedAt };
}

export function mapJapaneseProviders(
  details: TmdbDetails,
  syncedAt: string,
): ProviderRecord[] {
  const japan = details["watch/providers"]?.results.JP;
  if (!japan) return [];

  return providerTypes.flatMap((providerType) =>
    (japan[providerType] ?? []).map((provider) => ({
      tmdb_movie_id: details.id,
      provider_id: provider.provider_id,
      provider_name: provider.provider_name,
      provider_type: providerType,
      logo_path: provider.logo_path,
      tmdb_link: japan.link,
      is_available: true,
      last_seen_at: syncedAt,
    })),
  );
}
