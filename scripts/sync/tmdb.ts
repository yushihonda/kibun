import { HttpError, isRetryableHttpError, withRetry } from "./retry";
import type {
  MediaType,
  TmdbAlternativeTitle,
  TmdbCredit,
  TmdbDetails,
  TmdbGenre,
  TmdbKeyword,
  TmdbListMovie,
  TmdbListResponse,
  TmdbProvider,
  TmdbReview,
  TmdbSource,
  TmdbVideo,
} from "./types";

type SourceConfig = {
  path: string;
  params?: Record<string, string | number | boolean>;
};

export type TmdbListFilters = {
  releaseDateFrom?: string;
  releaseDateTo?: string;
};

type RawTmdbListItem = Partial<TmdbListMovie> & {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
};

type RawTmdbDetails = RawTmdbListItem & {
  genres?: TmdbGenre[];
  runtime?: number | null;
  episode_run_time?: number[];
  status?: string;
  tagline?: string;
  homepage?: string;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  credits?: { cast?: TmdbCredit[]; crew?: TmdbCredit[] };
  created_by?: TmdbCredit[];
  videos?: { results?: TmdbVideo[] };
  keywords?: { keywords?: TmdbKeyword[]; results?: TmdbKeyword[] };
  alternative_titles?: {
    titles?: TmdbAlternativeTitle[];
    results?: TmdbAlternativeTitle[];
  };
  reviews?: { results?: TmdbReview[] };
  belongs_to_collection?: { id: number; name: string } | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  "watch/providers"?: {
    results?: Record<
      string,
      {
        link: string;
        flatrate?: TmdbProvider[];
        rent?: TmdbProvider[];
        buy?: TmdbProvider[];
      }
    >;
  };
};

const MAX_RUNTIME_MINUTES = 600;

export function normalizedRuntime(
  runtime: number | null | undefined,
): number | null {
  return runtime !== null &&
    runtime !== undefined &&
    Number.isFinite(runtime) &&
    runtime > 0 &&
    runtime <= MAX_RUNTIME_MINUTES
    ? runtime
    : null;
}

export function sourceConfig(
  mediaType: MediaType,
  source: TmdbSource,
  filters: TmdbListFilters = {},
): SourceConfig {
  const kind = mediaType === "tv" ? "tv" : "movie";
  const releaseDateParams =
    mediaType === "movie"
      ? {
          ...(filters.releaseDateFrom
            ? { "primary_release_date.gte": filters.releaseDateFrom }
            : {}),
          ...(filters.releaseDateTo
            ? { "primary_release_date.lte": filters.releaseDateTo }
            : {}),
        }
      : {
          ...(filters.releaseDateFrom
            ? { "first_air_date.gte": filters.releaseDateFrom }
            : {}),
          ...(filters.releaseDateTo
            ? { "first_air_date.lte": filters.releaseDateTo }
            : {}),
        };
  if (source === "discover") {
    return {
      path: `/discover/${kind}`,
      params: {
        sort_by: "popularity.desc",
        include_adult: false,
        ...releaseDateParams,
      },
    };
  }
  if (source === "popular") return { path: `/${kind}/popular` };
  if (source === "trending") return { path: `/trending/${kind}/week` };
  if (source === "now_playing") {
    return {
      path: mediaType === "tv" ? "/tv/airing_today" : "/movie/now_playing",
    };
  }
  if (source === "upcoming") {
    return {
      path: mediaType === "tv" ? "/tv/on_the_air" : "/movie/upcoming",
    };
  }
  if (source === "japan") {
    return {
      path: `/discover/${kind}`,
      params: {
        sort_by: "popularity.desc",
        include_adult: false,
        with_origin_country: "JP",
        ...releaseDateParams,
      },
    };
  }
  return {
    path: `/discover/${kind}`,
    params: {
      sort_by: "popularity.desc",
      include_adult: false,
      with_origin_country: "KR",
      with_original_language: "ko",
      ...releaseDateParams,
    },
  };
}

function normalizedListItem(
  item: RawTmdbListItem,
  mediaType: MediaType,
): TmdbListMovie {
  return {
    id: item.id,
    media_type: mediaType,
    title: mediaType === "tv" ? (item.name ?? "") : (item.title ?? ""),
    original_title:
      mediaType === "tv"
        ? (item.original_name ?? item.name ?? "")
        : (item.original_title ?? item.title ?? ""),
    overview: item.overview ?? "",
    release_date: mediaType === "tv" ? item.first_air_date : item.release_date,
    poster_path: item.poster_path ?? null,
    backdrop_path: item.backdrop_path ?? null,
    genre_ids: item.genre_ids ?? [],
    popularity: Number(item.popularity ?? 0),
    vote_average: Number(item.vote_average ?? 0),
    vote_count: Number(item.vote_count ?? 0),
    adult: item.adult ?? false,
    original_language: item.original_language ?? "",
    origin_country: item.origin_country ?? [],
  };
}

function normalizedDetails(
  item: RawTmdbDetails,
  mediaType: MediaType,
): TmdbDetails {
  const listItem = normalizedListItem(item, mediaType);
  const creators = (item.created_by ?? []).map((person) => ({
    ...person,
    job: "Creator",
  }));
  const episodeRuntime = (item.episode_run_time ?? [])
    .map(normalizedRuntime)
    .find((runtime): runtime is number => runtime !== null);

  return {
    ...listItem,
    genres: item.genres ?? [],
    runtime:
      mediaType === "tv"
        ? (episodeRuntime ?? null)
        : normalizedRuntime(item.runtime),
    status: item.status ?? "",
    tagline: item.tagline ?? "",
    homepage: item.homepage ?? "",
    imdb_id: item.imdb_id ?? item.external_ids?.imdb_id ?? null,
    credits: {
      cast: item.credits?.cast ?? [],
      crew: [...(item.credits?.crew ?? []), ...creators],
    },
    videos: { results: item.videos?.results ?? [] },
    keywords: {
      keywords: item.keywords?.keywords ?? item.keywords?.results ?? [],
    },
    alternative_titles: {
      titles:
        item.alternative_titles?.titles ??
        item.alternative_titles?.results ??
        [],
    },
    reviews: { results: item.reviews?.results ?? [] },
    belongs_to_collection:
      mediaType === "movie" ? (item.belongs_to_collection ?? null) : null,
    number_of_seasons:
      mediaType === "tv" ? (item.number_of_seasons ?? null) : null,
    number_of_episodes:
      mediaType === "tv" ? (item.number_of_episodes ?? null) : null,
    "watch/providers": {
      results: item["watch/providers"]?.results ?? {},
    },
  };
}

export class TmdbClient {
  constructor(
    private readonly bearerToken: string,
    private readonly baseUrl = "https://api.themoviedb.org/3",
  ) {}

  async list(
    source: TmdbSource,
    page: number,
    mediaType: MediaType = "movie",
    filters: TmdbListFilters = {},
  ): Promise<TmdbListResponse> {
    const config = sourceConfig(mediaType, source, filters);
    const response = await this.request<{
      page: number;
      total_pages: number;
      results: RawTmdbListItem[];
    }>(config.path, {
      page,
      ...config.params,
    });
    return {
      ...response,
      results: response.results.map((item) =>
        normalizedListItem(item, mediaType),
      ),
    };
  }

  async search(query: string, page = 1): Promise<TmdbListResponse> {
    const response = await this.request<{
      page: number;
      total_pages: number;
      results: Array<RawTmdbListItem & { media_type?: string }>;
    }>("/search/multi", {
      query: query.trim().slice(0, 200),
      page,
      include_adult: false,
    });
    return {
      ...response,
      results: response.results.flatMap((item) =>
        item.media_type === "movie" || item.media_type === "tv"
          ? [normalizedListItem(item, item.media_type)]
          : [],
      ),
    };
  }

  async details(
    movieId: number,
    mediaType: MediaType = "movie",
  ): Promise<TmdbDetails> {
    const response = await this.request<RawTmdbDetails>(
      `/${mediaType}/${movieId}`,
      {
        append_to_response:
          "credits,videos,watch/providers,keywords,alternative_titles,reviews,external_ids",
        include_video_language: "ja,en,null",
      },
    );
    return normalizedDetails(response, mediaType);
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | boolean>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("language", "ja-JP");
    url.searchParams.set("region", "JP");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    return withRetry(
      async () => {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.bearerToken}`,
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          const retryAfter = Number(response.headers.get("retry-after"));
          throw new HttpError(
            `TMDB ${response.status}: ${await response.text()}`,
            response.status,
            Number.isFinite(retryAfter) ? retryAfter * 1_000 : undefined,
          );
        }
        return (await response.json()) as T;
      },
      { shouldRetry: isRetryableHttpError },
    );
  }
}

export function pageLimit(totalPages: number, configured?: string): number {
  const parsed = configured === undefined ? totalPages : Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("SYNC_MAX_PAGES must be a positive integer");
  }
  return Math.min(totalPages, parsed, 500);
}

export function pageEnd(
  totalPages: number,
  configured: string | undefined,
  startPage: number,
): number {
  if (!Number.isInteger(startPage) || startPage < 1 || startPage > 500) {
    throw new Error("SYNC_START_PAGE must be an integer from 1 to 500");
  }
  const pageCount = configured === undefined ? 500 : pageLimit(500, configured);
  return Math.min(totalPages, 500, startPage + pageCount - 1);
}
