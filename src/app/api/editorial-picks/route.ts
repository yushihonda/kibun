import { NextResponse } from "next/server";
import { demoMovies } from "@/data/demo-movies";
import { loadEditorialMovies } from "@/lib/movies/editorial";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({
      movies: demoMovies.filter((movie) => movie.editorialComment).slice(0, 12),
      source: "demo",
    });
  }

  try {
    const movies = await loadEditorialMovies(supabase);
    return NextResponse.json({ movies, source: "supabase" });
  } catch (error) {
    console.error("editorial picks query failed", error);
    return NextResponse.json({
      movies: demoMovies.filter((movie) => movie.editorialComment).slice(0, 12),
      source: "demo",
    });
  }
}
