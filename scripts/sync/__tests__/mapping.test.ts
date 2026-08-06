import { afterEach, describe, expect, it, vi } from "vitest";
import { mapJapaneseProviders, mapTmdbMovie } from "../mapping.js";
import { parseSources } from "../pipeline.js";
import { backoffDelay } from "../retry.js";
import { pageLimit, TmdbClient } from "../tmdb.js";
import type { TmdbDetails, TmdbVideo } from "../types.js";
import { selectYouTubeVideo } from "../youtube.js";

function movie(overrides: Partial<TmdbDetails> = {}): TmdbDetails {
  return {
    id: 42,
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
    expect(first.original_language).toBe("ja");
    expect(first.origin_countries).toEqual(["JP"]);
    expect(first.synced_hash).toBe(second.synced_hash);
    expect(first.last_synced_at).not.toBe(second.last_synced_at);
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

  it("parses selective backfill sources safely", () => {
    expect(parseSources("japan,korea,japan")).toEqual(["japan", "korea"]);
    expect(parseSources(undefined)).toEqual([
      "discover",
      "popular",
      "now_playing",
      "japan",
      "korea",
    ]);
    expect(() => parseSources("japan,unknown")).toThrow(
      "Unknown SYNC_SOURCES: unknown",
    );
  });
});
