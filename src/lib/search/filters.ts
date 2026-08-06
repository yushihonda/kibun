import type { Movie, OfferType } from "@/types/movie";

const offerTypes = new Set<OfferType>(["flatrate", "rent", "buy"]);

function list(value: string | null, max = 20) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, max);
}

function boundedNumber(
  value: string | null,
  minimum: number,
  maximum: number,
): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export type SearchFilters = {
  query: string;
  providers: string[];
  offerTypes: OfferType[];
  maxRuntime: number | null;
  minRating: number | null;
  tags: string[];
  excludeWatched: boolean;
  limit: number;
  offset: number;
};

export function parseSearchFilters(params: URLSearchParams): SearchFilters {
  const requestedRating = boundedNumber(params.get("minRating"), 0, 10);
  return {
    query: (params.get("q") ?? "").trim().slice(0, 500),
    providers: list(params.get("providers")),
    offerTypes: list(params.get("offerTypes")).filter(
      (value): value is OfferType => offerTypes.has(value as OfferType),
    ),
    maxRuntime: boundedNumber(params.get("maxRuntime"), 1, 1440),
    // The existing UI sends 1–5 stars while TMDB stores ratings on a 0–10 scale.
    minRating:
      requestedRating !== null && requestedRating <= 5
        ? requestedRating * 2
        : requestedRating,
    tags: list(params.get("tags")),
    excludeWatched: params.get("excludeWatched") === "true",
    limit: Math.trunc(boundedNumber(params.get("limit"), 1, 100) ?? 30),
    offset: Math.trunc(boundedNumber(params.get("offset"), 0, 10_000) ?? 0),
  };
}

export function filterDemoMovies(movies: Movie[], filters: SearchFilters) {
  const query = filters.query.toLocaleLowerCase("ja");
  return movies
    .filter((movie) => {
      const searchable = [
        movie.title,
        movie.originalTitle,
        movie.overview,
        ...movie.genres,
        ...movie.emotionalTags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ja");

      return (
        (!query || searchable.includes(query)) &&
        (filters.maxRuntime === null || movie.runtime <= filters.maxRuntime) &&
        (filters.minRating === null ||
          movie.voteAverage >= filters.minRating) &&
        (!filters.tags.length ||
          filters.tags.some(
            (tag) =>
              movie.emotionalTags.some(
                (item) => item.toLocaleLowerCase("ja") === tag,
              ) ||
              movie.genres.some((item) => item.toLocaleLowerCase("ja") === tag),
          )) &&
        (!filters.providers.length ||
          movie.providers.some((provider) =>
            filters.providers.includes(provider.slug.toLowerCase()),
          )) &&
        (!filters.offerTypes.length ||
          movie.providers.some((provider) =>
            filters.offerTypes.includes(provider.type),
          ))
      );
    })
    .slice(filters.offset, filters.offset + filters.limit);
}
