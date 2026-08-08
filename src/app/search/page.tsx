import type { Metadata } from "next";
import { demoMovies } from "@/data/demo-movies";
import { SearchExperience } from "@/features/search/search-experience";
import { loadHomeFeed } from "@/lib/movies/home-feed";
import { buildSearchRails } from "@/lib/search/category-rails";
import { PROVIDER_FILTERS } from "@/lib/providers/catalog";
import { createClient } from "@/lib/supabase/server";
import type { Movie, MovieRail } from "@/types/movie";

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
  let initialRails: MovieRail[] = buildSearchRails(demoMovies, null, {
    editorialMovies,
    emptyQuery: true,
  });
  let providerLogos: Record<string, string> = {};

  if (supabase) {
    try {
      const [feed, providerResult] = await Promise.all([
        loadHomeFeed(supabase),
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
      initialRails = feed.sections;
      initialMovies = [
        ...new Map(
          feed.sections
            .flatMap((rail) => rail.movies)
            .map((movie) => [movie.id, movie] as const),
        ).values(),
      ];
      editorialMovies = initialMovies.filter((movie) =>
        Boolean(movie.editorialComment),
      );
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
      editorialMovies = demoMovies.filter((movie) => movie.editorialComment);
      initialRails = buildSearchRails(demoMovies, null, {
        editorialMovies,
        emptyQuery: true,
      });
    }
  }

  return (
    <SearchExperience
      initialMovies={initialMovies}
      initialRails={initialRails}
      editorialMovies={editorialMovies}
      providerLogos={providerLogos}
    />
  );
}
