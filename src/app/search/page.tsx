import type { Metadata } from "next";
import { demoMovies } from "@/data/demo-movies";
import { SearchExperience } from "@/features/search/search-experience";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import { loadCatalogMovies } from "@/lib/movies/catalog";
import { createClient } from "@/lib/supabase/server";
import type { Movie } from "@/types/movie";

export const metadata: Metadata = {
  title: "映画を検索",
  description: "気分、上映時間、配信サービスから次に観たい映画を検索。",
};

export default async function SearchPage() {
  const supabase = await createClient();
  let initialMovies: Movie[] = demoMovies;
  let editorialMovies: Movie[] = supabase
    ? []
    : demoMovies.filter((movie) => movie.editorialComment);

  if (supabase) {
    try {
      [initialMovies, editorialMovies] = await Promise.all([
        loadCatalogMovies(supabase, { limit: 100 }),
        loadEditorialMovies(supabase),
      ]);
    } catch {
      initialMovies = demoMovies;
      editorialMovies = [];
    }
  }

  return (
    <SearchExperience
      initialMovies={initialMovies}
      editorialMovies={editorialMovies}
    />
  );
}
