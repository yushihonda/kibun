export const EMOTION_VOCABULARY = [
  "心温まる",
  "爽快",
  "笑える",
  "泣ける",
  "切ない",
  "緊張感",
  "怖い",
  "不穏",
  "驚き",
  "考えさせられる",
  "希望",
  "癒やし",
  "ロマンチック",
  "ノスタルジック",
  "高揚感",
] as const;

export type EmotionTag = (typeof EMOTION_VOCABULARY)[number];
export const TMDB_MEDIA_TYPES = ["movie", "tv"] as const;
export type MediaType = (typeof TMDB_MEDIA_TYPES)[number];
export const TMDB_SOURCES = [
  "discover",
  "popular",
  "now_playing",
  "upcoming",
  "trending",
  "japan",
  "korea",
] as const;

export type TmdbSource = (typeof TMDB_SOURCES)[number];

export interface TmdbListMovie {
  id: number;
  media_type: MediaType;
  title: string;
  original_title: string;
  overview: string;
  release_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
  adult: boolean;
  original_language?: string;
  origin_country?: string[];
}

export interface TmdbListResponse {
  page: number;
  total_pages: number;
  results: TmdbListMovie[];
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCredit {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profile_path: string | null;
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
  published_at: string;
  iso_639_1?: string | null;
}

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

export interface TmdbAlternativeTitle {
  iso_3166_1: string;
  title: string;
  type: string;
}

export interface TmdbReview {
  id: string;
  content: string;
}

export interface TmdbDetails extends Omit<TmdbListMovie, "genre_ids"> {
  genres: TmdbGenre[];
  runtime: number | null;
  status: string;
  tagline: string;
  homepage: string;
  imdb_id: string | null;
  credits?: { cast: TmdbCredit[]; crew: TmdbCredit[] };
  videos?: { results: TmdbVideo[] };
  keywords?: { keywords: TmdbKeyword[] };
  alternative_titles?: { titles: TmdbAlternativeTitle[] };
  reviews?: { results: TmdbReview[] };
  belongs_to_collection?: { id: number; name: string } | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  latest_season?: { number: number; air_date: string } | null;
  // Trailers TMDB files under the latest season rather than the show.
  latest_season_videos?: TmdbVideo[];
  "watch/providers"?: {
    results: Record<
      string,
      {
        link: string;
        flatrate?: TmdbProvider[];
        rent?: TmdbProvider[];
        buy?: TmdbProvider[];
      }
    >;
  };
}

export interface MovieRecord {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  original_title: string;
  overview: string;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: TmdbGenre[];
  runtime_minutes: number | null;
  status: string;
  tagline: string;
  homepage: string;
  imdb_id: string | null;
  popularity: number;
  vote_average: number;
  vote_count: number;
  adult: boolean;
  original_language: string;
  origin_countries: string[];
  cast: TmdbCredit[];
  directors: TmdbCredit[];
  youtube_video_key: string | null;
  emotion_tags: EmotionTag[];
  emotional_scores: Record<string, number>;
  emotion_source: string;
  emotion_updated_at: string;
  keywords: string[];
  aliases: string[];
  tmdb_collection_id: number | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  latest_season_number: number | null;
  latest_season_air_date: string | null;
  sources: TmdbSource[];
  trending_at: string | null;
  theatrical_at: string | null;
  synced_hash: string;
  last_synced_at: string;
}

export type ProviderType = "flatrate" | "rent" | "buy";

export interface ProviderRecord {
  tmdb_movie_id: number;
  provider_id: number;
  provider_name: string;
  provider_type: ProviderType;
  logo_path: string | null;
  tmdb_link: string;
  is_available: boolean;
  last_seen_at: string;
}

export interface SyncFailure {
  tmdbId?: number;
  mediaType?: MediaType;
  source?: TmdbSource;
  message: string;
}
