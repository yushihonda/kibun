import type { Metadata } from "next";
import { demoMovies } from "@/data/demo-movies";
import { SearchExperience } from "@/features/search/search-experience";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import { loadCatalogMovies } from "@/lib/movies/catalog";
import { PROVIDER_FILTERS } from "@/lib/providers/catalog";
import { createClient } from "@/lib/supabase/server";
import type { Movie } from "@/types/movie";

export const metadata: Metadata = {
  title: "映画・ドラマを検索",
  description: "気分、時間、配信サービスから次に観たい映画やドラマを検索。",
};

export default async function SearchPage() {
  const supabase = await createClient();
  let initialMovies: Movie[] = demoMovies;
  let editorialMovies: Movie[] = supabase
    ? []
    : demoMovies.filter((movie) => movie.editorialComment);
  let providerLogos: Record<string, string> = {};

  if (supabase) {
    try {
      const [catalog, editorial, providerResult] = await Promise.all([
        loadCatalogMovies(supabase, { limit: 48 }),
        loadEditorialMovies(supabase, { limit: 12 }),
        supabase
          .from("providers")
          .select("tmdb_provider_id,logo_path")
          .in(
            "tmdb_provider_id",
            PROVIDER_FILTERS.flatMap((provider) => [
              ...provider.tmdbProviderIds,
            ]),
          ),
      ]);
      initialMovies = catalog;
      editorialMovies = editorial;
      const pathById = new Map(
        (providerResult.data ?? []).map((provider) => [
          Number(provider.tmdb_provider_id),
          provider.logo_path as string | null,
        ]),
      );
      providerLogos = Object.fromEntries(
        PROVIDER_FILTERS.flatMap((provider) => {
          const logoPath = provider.tmdbProviderIds
            .map((id) => pathById.get(id))
            .find((path): path is string => Boolean(path));
          return logoPath ? [[provider.slug, logoPath]] : [];
        }),
      );
    } catch {
      initialMovies = demoMovies;
      editorialMovies = [];
    }
  }

  return (
    <SearchExperience
      initialMovies={initialMovies}
      editorialMovies={editorialMovies}
      providerLogos={providerLogos}
    />
  );
}
