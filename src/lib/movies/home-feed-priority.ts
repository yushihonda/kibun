import type { Movie, MovieRail } from "@/types/movie";

const DEFAULT_VIDEO_LIMIT = 32;

type HomeFeedPriorityOptions = {
  limit: number;
  videoLimit?: number;
};

export function prioritizeHomeFeedSections(
  sections: MovieRail[],
  options: HomeFeedPriorityOptions,
): MovieRail[] {
  const limit = Math.max(0, Math.floor(options.limit));
  const videoLimit = Math.min(
    limit,
    Math.max(0, Math.floor(options.videoLimit ?? DEFAULT_VIDEO_LIMIT)),
  );
  if (!limit) return [];

  const seenVideos = new Set<string>();
  const videoMovies: Movie[] = [];
  for (const section of sections) {
    for (const movie of section.movies) {
      if (!movie.video || seenVideos.has(movie.id)) continue;
      seenVideos.add(movie.id);
      videoMovies.push(movie);
      if (videoMovies.length >= videoLimit) break;
    }
    if (videoMovies.length >= videoLimit) break;
  }

  const prioritized: MovieRail[] = [];
  const used = new Set(videoMovies.map((movie) => movie.id));
  let remaining = limit;
  if (videoMovies.length) {
    prioritized.push({
      id: "video-picks",
      title: "新着・おすすめ動画",
      description: "新作と話題作から、予告編をすぐ見られる作品を優先",
      movies: videoMovies,
      generatedAt: sections.find((section) => section.generatedAt)?.generatedAt,
    });
    remaining -= videoMovies.length;
  }

  for (const section of sections) {
    if (remaining <= 0) break;
    const movies: Movie[] = [];
    for (const movie of section.movies) {
      if (used.has(movie.id)) continue;
      used.add(movie.id);
      movies.push(movie);
      remaining -= 1;
      if (remaining <= 0) break;
    }
    if (movies.length) prioritized.push({ ...section, movies });
  }

  return prioritized;
}
