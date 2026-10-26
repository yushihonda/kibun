import type { MovieVideo } from "@/types/movie";

export type MovieVideoRow = {
  platform: "youtube" | "tiktok";
  video_id: string;
  url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  season_number?: number | null;
};

function preferred(candidate: MovieVideoRow, current: MovieVideoRow) {
  const candidateYouTube = candidate.platform === "youtube";
  if (candidateYouTube !== (current.platform === "youtube")) {
    return candidateYouTube;
  }
  // The sync touches the trailer it currently selects on every run, so the
  // most recently updated row is the current choice for that season.
  const recency = (row: MovieVideoRow) =>
    row.updated_at ?? row.created_at ?? "";
  return recency(candidate) > recency(current);
}

// One trailer per season (or for the show as a whole), with the newest
// season leading so a show's current buzz plays first. The full list is
// only returned when there is more than one to choose from.
export function selectMovieVideos(rows: MovieVideoRow[]): {
  video?: MovieVideo;
  videos?: MovieVideo[];
} {
  const bySeason = new Map<number | null, MovieVideoRow>();
  for (const row of rows) {
    const season = row.season_number ?? null;
    const current = bySeason.get(season);
    if (!current || preferred(row, current)) bySeason.set(season, row);
  }
  const options: MovieVideo[] = [...bySeason.entries()]
    .sort(([a], [b]) => (a ?? 0) - (b ?? 0))
    .map(([season, row]) => ({
      platform: row.platform,
      videoId: row.video_id,
      url: row.url ?? undefined,
      ...(season !== null ? { seasonNumber: season } : {}),
    }));
  if (!options.length) return {};
  const seasonal = options.filter((option) => option.seasonNumber);
  const video = seasonal.length
    ? seasonal.reduce((latest, option) =>
        (option.seasonNumber ?? 0) > (latest.seasonNumber ?? 0)
          ? option
          : latest,
      )
    : options[0];
  return options.length > 1 ? { video, videos: options } : { video };
}

export function videoOptionLabel(video: MovieVideo): string {
  return video.seasonNumber ? `シーズン${video.seasonNumber}` : "予告編";
}
