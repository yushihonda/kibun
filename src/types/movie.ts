export type OfferType = "flatrate" | "rent" | "buy";
export type VideoPlatform = "youtube" | "tiktok";
export type MediaType = "movie" | "tv";
export type SocialSentiment = "positive" | "mixed" | "negative" | "neutral";

export type Provider = {
  id: number;
  name: string;
  slug: string;
  type: OfferType;
  logoPath?: string;
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

export type SocialPostPreview = {
  videoId: string;
  url: string;
  caption: string;
  authorUsername?: string;
  postedAt?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  hashtags: string[];
};

export type MovieSocialSignals = {
  postCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  averageEngagementRate: number;
  trendScore: number;
  sentiment: SocialSentiment;
  sentimentScore: number;
  topHashtags: string[];
  topics: string[];
  summary?: string;
  latestPostAt?: string;
  updatedAt: string;
  featuredPosts: SocialPostPreview[];
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
  theatricalAt?: string;
  providersCheckedAt?: string;
  providers: Provider[];
  video?: MovieVideo;
  matchReasons?: string[];
  editorialComment?: string;
  recommendationReason?: string;
  socialSignals?: MovieSocialSignals;
};

export type MovieRail = {
  id: string;
  title: string;
  movies: Movie[];
  description?: string;
  generatedAt?: string;
};
