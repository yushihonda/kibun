import { demoMovies } from "@/data/demo-movies";
import { MovieFeed } from "@/features/feed/movie-feed";
import {
  loadPublicHomeFeed,
  loadRequestHomeFeed,
} from "@/lib/movies/public-home-feed";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import { createClient } from "@/lib/supabase/server";
import type { MovieRail } from "@/types/movie";
import { cookies } from "next/headers";

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
  const hasSession = hasSupabaseAuthCookie((await cookies()).getAll());
  if (!hasSession) {
    let sections: MovieRail[];
    try {
      sections = (await loadPublicHomeFeed()).sections;
      if (!sections.length) sections = demoSections();
    } catch (error) {
      console.error("Public home feed failed", error);
      sections = demoSections();
    }
    return <MovieFeed sections={sections} />;
  }

  const supabase = await createClient();
  if (!supabase) {
    const sections = demoSections();
    return <MovieFeed sections={sections} />;
  }

  let sections: MovieRail[];
  try {
    sections = (await loadRequestHomeFeed(supabase)).sections;
    if (!sections.length) sections = demoSections();
  } catch (error) {
    console.error("Dynamic home feed failed", error);
    sections = demoSections();
  }
  return <MovieFeed sections={sections} />;
}
