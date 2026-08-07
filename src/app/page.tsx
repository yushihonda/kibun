import { demoMovies } from "@/data/demo-movies";
import { MovieFeed } from "@/features/feed/movie-feed";
import { loadHomeFeed } from "@/lib/movies/home-feed";
import { createClient } from "@/lib/supabase/server";
import type { MovieRail } from "@/types/movie";

function demoSections(): MovieRail[] {
  return [
    {
      id: "demo-movies",
      title: "映画",
      description: "外部サービス未設定時のデモ表示",
      movies: demoMovies.filter((movie) => movie.mediaType === "movie"),
    },
    {
      id: "demo-dramas",
      title: "ドラマ",
      description: "外部サービス未設定時のデモ表示",
      movies: demoMovies.filter((movie) => movie.mediaType === "tv"),
    },
  ].filter((rail) => rail.movies.length > 0);
}

export default async function Home() {
  const supabase = await createClient();
  if (!supabase) {
    const sections = demoSections();
    return (
      <MovieFeed
        movies={sections.flatMap((section) => section.movies)}
        sections={sections}
      />
    );
  }

  let sections: MovieRail[];
  try {
    sections = (await loadHomeFeed(supabase)).sections;
    if (!sections.length) sections = demoSections();
  } catch (error) {
    console.error("Dynamic home feed failed", error);
    sections = demoSections();
  }
  return (
    <MovieFeed
      movies={sections.flatMap((section) => section.movies)}
      sections={sections}
    />
  );
}
