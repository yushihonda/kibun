import type { TmdbDetails, TmdbVideo } from "./types";

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
      // Viewers are in Japan, so a Japanese cut beats an equally official
      // trailer of the same kind in another language.
      const japanese =
        Number(b.iso_639_1 === "ja") - Number(a.iso_639_1 === "ja");
      if (japanese !== 0) return japanese;
      return b.published_at.localeCompare(a.published_at);
    })[0];
}

export type SeasonTrailer = { key: string; season: number | null };

// One trailer for the show and, when TMDB files one under the newest
// season, one for that season. A show-level trailer published before a
// second season started is that show's first-season trailer.
export function selectSeasonTrailers(details: TmdbDetails): SeasonTrailer[] {
  const series = selectYouTubeVideo(details.videos?.results ?? []);
  const latest = details.latest_season;
  const seasonVideo =
    latest && latest.number >= 2
      ? selectYouTubeVideo(details.latest_season_videos ?? [])
      : undefined;
  const trailers: SeasonTrailer[] = [];
  if (series) {
    const beforeLatest =
      seasonVideo &&
      latest &&
      series.published_at.slice(0, 10) < latest.air_date;
    trailers.push({
      key: series.key,
      season: beforeLatest && latest.number === 2 ? 1 : null,
    });
  }
  if (seasonVideo && latest && seasonVideo.key !== series?.key) {
    trailers.push({ key: seasonVideo.key, season: latest.number });
  }
  return trailers;
}
