import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadRecommendations } from "@/lib/recommendations/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { movies: [], personalized: false, source: "unconfigured" },
      { status: 503 },
    );
  }
  const seedValue = request.nextUrl.searchParams.get("seed");
  const seedMovieId =
    seedValue && z.string().uuid().safeParse(seedValue).success
      ? seedValue
      : undefined;
  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? 18);
  const limit = Number.isInteger(limitValue)
    ? Math.min(Math.max(limitValue, 1), 40)
    : 18;

  try {
    const hasAuthSession = hasSupabaseAuthCookie(request.cookies.getAll());
    const user = hasAuthSession
      ? (await supabase.auth.getUser()).data.user
      : null;
    const result = await loadRecommendations(supabase, {
      seedMovieId,
      limit,
      user,
    });
    return NextResponse.json({ ...result, source: "supabase" });
  } catch (error) {
    console.error("Recommendation generation failed", error);
    return NextResponse.json(
      { movies: [], personalized: false, source: "supabase" },
      { status: 500 },
    );
  }
}
