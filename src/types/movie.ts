export type OfferType = "flatrate" | "rent" | "buy";
export type VideoPlatform = "youtube" | "tiktok";
export type MediaType = "movie" | "tv";

export type Provider = {
  id: number;
  name: string;
  slug: string;
  type: OfferType;
  tmdbLink?: string;
  checkedAt?: string;
};

export type MoviePerson = {
  id: number;
  name: string;
};

export type MovieVideo = {
  platform: VideoPlatform;
  videoId: string;
  url?: string;
};

export type Movie = {
  id: string;
  tmdbId?: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  overview: string;
  posterUrl: string;
  backdropUrl: string;
  releaseDate: string;
  runtime: number;
  voteAverage: number;
  voteCount?: number;
  popularity: number;
  genres: string[];
  emotionalTags: string[];
  emotionScores?: Record<string, number>;
  aliases?: string[];
  keywords?: string[];
  originCountries?: string[];
  cast?: MoviePerson[];
  directors?: MoviePerson[];
  collectionId?: number;
  sources?: string[];
  trendingAt?: string;
  providersCheckedAt?: string;
  providers: Provider[];
  video?: MovieVideo;
  matchReasons?: string[];
  editorialComment?: string;
  recommendationReason?: string;
};

export type MovieRail = {
  id: string;
  title: string;
  movies: Movie[];
  description?: string;
  generatedAt?: string;
};
