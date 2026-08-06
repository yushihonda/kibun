import { HttpError, isRetryableHttpError, withRetry } from "./retry.js";
import type { TmdbDetails, TmdbListResponse, TmdbSource } from "./types.js";

const SOURCE_CONFIG: Record<
  TmdbSource,
  { path: string; params?: Record<string, string | number | boolean> }
> = {
  discover: {
    path: "/discover/movie",
    params: { sort_by: "popularity.desc", include_adult: false },
  },
  popular: { path: "/movie/popular" },
  now_playing: { path: "/movie/now_playing" },
  japan: {
    path: "/discover/movie",
    params: {
      sort_by: "popularity.desc",
      include_adult: false,
      with_origin_country: "JP",
      with_original_language: "ja",
    },
  },
  korea: {
    path: "/discover/movie",
    params: {
      sort_by: "popularity.desc",
      include_adult: false,
      with_origin_country: "KR",
      with_original_language: "ko",
    },
  },
};

export class TmdbClient {
  constructor(
    private readonly bearerToken: string,
    private readonly baseUrl = "https://api.themoviedb.org/3",
  ) {}

  async list(source: TmdbSource, page: number): Promise<TmdbListResponse> {
    const config = SOURCE_CONFIG[source];
    return this.request<TmdbListResponse>(config.path, {
      page,
      ...config.params,
    });
  }

  async details(movieId: number): Promise<TmdbDetails> {
    return this.request<TmdbDetails>(`/movie/${movieId}`, {
      append_to_response:
        "credits,videos,watch/providers,keywords,alternative_titles,reviews",
      include_video_language: "ja,en,null",
    });
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
