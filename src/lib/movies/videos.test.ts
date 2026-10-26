import { describe, expect, it } from "vitest";
import {
  selectMovieVideos,
  videoOptionLabel,
  type MovieVideoRow,
} from "@/lib/movies/videos";

const row = (overrides: Partial<MovieVideoRow>): MovieVideoRow => ({
  platform: "youtube",
  video_id: "v",
  url: null,
  updated_at: "2026-10-01T00:00:00Z",
  season_number: null,
  ...overrides,
});

describe("selectMovieVideos", () => {
  it("leads with the newest season and offers every season", () => {
    const result = selectMovieVideos([
      row({ video_id: "s1", season_number: 1 }),
      row({ video_id: "s2", season_number: 2 }),
    ]);
    expect(result.video?.videoId).toBe("s2");
    expect(result.videos?.map(videoOptionLabel)).toEqual([
      "シーズン1",
      "シーズン2",
    ]);
  });

  it("keeps one trailer per season, preferring YouTube and the latest sync", () => {
    const result = selectMovieVideos([
      row({ video_id: "old", updated_at: "2026-01-01T00:00:00Z" }),
      row({ video_id: "current", updated_at: "2026-10-01T00:00:00Z" }),
      row({ video_id: "tiktok", platform: "tiktok", updated_at: "2026-12-01" }),
    ]);
    expect(result).toEqual({
      video: { platform: "youtube", videoId: "current", url: undefined },
    });
  });

  it("returns nothing when there are no trailers", () => {
    expect(selectMovieVideos([])).toEqual({});
  });
});
