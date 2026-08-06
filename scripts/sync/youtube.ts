import type { TmdbVideo } from "./types.js";

const typePriority: Record<string, number> = {
  Trailer: 3,
  Teaser: 2,
  Clip: 1,
};

export function selectYouTubeVideo(videos: TmdbVideo[]): TmdbVideo | undefined {
  return videos
    .filter((video) => video.site.toLowerCase() === "youtube")
    .sort((a, b) => {
      const official = Number(b.official) - Number(a.official);
      if (official !== 0) return official;
      const type = (typePriority[b.type] ?? 0) - (typePriority[a.type] ?? 0);
      if (type !== 0) return type;
      return b.published_at.localeCompare(a.published_at);
    })[0];
}
