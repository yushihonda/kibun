import { afterEach, describe, expect, it, vi } from "vitest";
import { mapJapaneseProviders, mapTmdbMovie } from "../mapping.js";
import { parseMediaTypes, parseSources } from "../pipeline.js";
import { backoffDelay, HttpError, isRetryableHttpError } from "../retry.js";
import { pageLimit, TmdbClient } from "../tmdb.js";
import type { TmdbDetails, TmdbVideo } from "../types.js";
import { selectYouTubeVideo } from "../youtube.js";

function movie(overrides: Partial<TmdbDetails> = {}): TmdbDetails {
  return {
    id: 42,
    media_type: "movie",
    title: "作品",
    original_title: "Movie",
    overview: "概要",
    release_date: "2026-08-01",
    poster_path: null,
    backdrop_path: null,
    genres: [{ id: 18, name: "ドラマ" }],
    popularity: 10,
    vote_average: 8,
    vote_count: 100,
    adult: false,
    original_language: "ja",
    origin_country: ["JP"],
    runtime: 120,
    status: "Released",
    tagline: "",
    homepage: "",
    imdb_id: null,
    number_of_seasons: null,
    number_of_episodes: null,
    ...overrides,
  };
}

describe("TMDB mapping", () => {
  it("maps and deduplicates sources with a timestamp-independent hash", () => {
    const first = mapTmdbMovie(
      movie(),
      ["popular", "discover", "popular"],
      ["希望"],
      "2026-08-01T00:00:00Z",
    );
    const second = mapTmdbMovie(
      movie(),
      ["popular", "discover"],
      ["希望"],
      "2026-09-01T00:00:00Z",
    );
    expect(first.sources).toEqual(["discover", "popular"]);
    expect(first.trending_at).toBeNull();
    expect(first.media_type).toBe("movie");
    expect(first.original_language).toBe("ja");
    expect(first.origin_countries).toEqual(["JP"]);
    expect(first.synced_hash).toBe(second.synced_hash);
    expect(first.last_synced_at).not.toBe(second.last_synced_at);
  });

  it("marks weekly trends without putting the timestamp in the hash", () => {
    const first = mapTmdbMovie(
      movie(),
      ["trending"],
      ["希望"],
      "2026-08-01T00:00:00Z",
    );
    const second = mapTmdbMovie(
      movie(),
      ["trending"],
      ["希望"],
      "2026-08-02T00:00:00Z",
    );

    expect(first.trending_at).toBe("2026-08-01T00:00:00Z");
    expect(first.synced_hash).toBe(second.synced_hash);
  });

  it("extracts only Japanese watch providers", () => {
    const providers = mapJapaneseProviders(
      movie({
        "watch/providers": {
          results: {
            JP: {
              link: "https://tmdb.example/jp",
              flatrate: [
                {
                  provider_id: 1,
                  provider_name: "Stream",
                  logo_path: null,
                  display_priority: 1,
                },
              ],
            },
            US: { link: "https://tmdb.example/us", buy: [] },
          },
        },
      }),
      "2026-08-01T00:00:00Z",
    );
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      tmdb_movie_id: 42,
      provider_type: "flatrate",
      is_available: true,
    });
  });
});

describe("video and paging helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prefers official YouTube trailers", () => {
    const videos: TmdbVideo[] = [
      {
        key: "teaser",
        site: "YouTube",
        type: "Teaser",
        official: true,
        name: "",
        published_at: "2026-08-02",
      },
      {
        key: "trailer",
        site: "YouTube",
        type: "Trailer",
        official: true,
        name: "",
        published_at: "2026-08-01",
      },
      {
        key: "vimeo",
        site: "Vimeo",
        type: "Trailer",
        official: true,
        name: "",
        published_at: "2026-08-03",
      },
    ];
    expect(selectYouTubeVideo(videos)?.key).toBe("trailer");
  });

  it("caps TMDB pages and computes deterministic backoff", () => {
    expect(pageLimit(100, "2")).toBe(2);
    expect(pageLimit(800)).toBe(500);
    expect(() => pageLimit(10, "0")).toThrow();
    expect(backoffDelay(2, 100, 10_000, () => 0)).toBe(200);
    expect(isRetryableHttpError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableHttpError(new HttpError("bad request", 400))).toBe(false);
  });

  it("uses dedicated origin filters for Japanese and Korean movies", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new TmdbClient("token", "https://tmdb.example/3");

    await client.list("japan", 2);
    await client.list("korea", 3);

    const japan = new URL(String(fetchMock.mock.calls[0][0]));
    const korea = new URL(String(fetchMock.mock.calls[1][0]));
    expect(japan.searchParams.get("with_origin_country")).toBe("JP");
    expect(japan.searchParams.get("with_original_language")).toBe("ja");
    expect(korea.searchParams.get("with_origin_country")).toBe("KR");
    expect(korea.searchParams.get("with_original_language")).toBe("ko");
  });

  it("requests Japanese and fallback-language videos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(movie()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new TmdbClient("token", "https://tmdb.example/3");

    await client.details(42);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("append_to_response")).toContain("videos");
    expect(url.searchParams.get("include_video_language")).toBe("ja,en,null");
  });

  it("normalizes TV drama fields and uses the TV endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1396,
          name: "ブレイキング・バッド",
          original_name: "Breaking Bad",
          overview: "概要",
          first_air_date: "2008-01-20",
          poster_path: null,
          backdrop_path: null,
          genres: [{ id: 18, name: "ドラマ" }],
          popularity: 100,
          vote_average: 8.9,
          vote_count: 10_000,
          original_language: "en",
          origin_country: ["US"],
          episode_run_time: [47],
          number_of_seasons: 5,
          number_of_episodes: 62,
          status: "Ended",
          created_by: [{ id: 1, name: "Vince Gilligan", profile_path: null }],
          keywords: { results: [{ id: 2, name: "crime" }] },
          alternative_titles: { results: [] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new TmdbClient("token", "https://tmdb.example/3");

    const details = await client.details(1396, "tv");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/tv/1396");
    expect(details).toMatchObject({
      media_type: "tv",
      title: "ブレイキング・バッド",
      original_title: "Breaking Bad",
      release_date: "2008-01-20",
      runtime: 47,
      number_of_seasons: 5,
      number_of_episodes: 62,
    });
    expect(details.keywords?.keywords[0].name).toBe("crime");
    expect(details.credits?.crew[0].job).toBe("Creator");
  });

  it("searches films and TV dramas while excluding people", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          page: 1,
          total_pages: 1,
          results: [
            { id: 1, media_type: "movie", title: "映画" },
            { id: 2, media_type: "tv", name: "ドラマ" },
            { id: 3, media_type: "person", name: "俳優" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new TmdbClient("token", "https://tmdb.example/3");

    const response = await client.search("作品");

    expect(response.results.map((result) => result.media_type)).toEqual([
      "movie",
      "tv",
    ]);
    expect(response.results.map((result) => result.title)).toEqual([
      "映画",
      "ドラマ",
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/search/multi");
  });

  it("parses selective backfill sources safely", () => {
    expect(parseSources("japan,korea,japan")).toEqual(["japan", "korea"]);
    expect(parseSources(undefined)).toEqual([
      "discover",
      "popular",
      "now_playing",
      "trending",
      "japan",
      "korea",
    ]);
    expect(() => parseSources("japan,unknown")).toThrow(
      "Unknown SYNC_SOURCES: unknown",
    );
    expect(parseMediaTypes(undefined)).toEqual(["movie", "tv"]);
    expect(parseMediaTypes("tv,tv")).toEqual(["tv"]);
    expect(() => parseMediaTypes("series")).toThrow(
      "Unknown SYNC_MEDIA_TYPES: series",
    );
  });
});
