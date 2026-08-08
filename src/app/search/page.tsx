import type { Metadata } from "next";
import { demoMovies } from "@/data/demo-movies";
import { SearchExperience } from "@/features/search/search-experience";
import { loadPublicSearchLanding } from "@/lib/movies/search-landing";
import { buildSearchRails } from "@/lib/search/category-rails";
import type { MovieRail } from "@/types/movie";

export const metadata: Metadata = {
  title: "映画・ドラマを検索",
  description: "気分、時間、配信サービスから次に観たい映画やドラマを検索。",
};

export default async function SearchPage() {
  const demoEditorialMovies = demoMovies.filter((movie) =>
    Boolean(movie.editorialComment),
  );
  let initialRails: MovieRail[] = buildSearchRails(demoMovies, null, {
    editorialMovies: demoEditorialMovies,
    emptyQuery: true,
  });
  let providerLogos: Record<string, string> = {};

  try {
    const landing = await loadPublicSearchLanding();
    if (landing.sections.length) initialRails = landing.sections;
    providerLogos = landing.providerLogos;
  } catch {
    initialRails = buildSearchRails(demoMovies, null, {
      editorialMovies: demoEditorialMovies,
      emptyQuery: true,
    });
  }

  return (
    <SearchExperience
      initialRails={initialRails}
      providerLogos={providerLogos}
    />
  );
}
