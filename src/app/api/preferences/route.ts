import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const preferencesSchema = z.object({
  personalizationEnabled: z.boolean(),
  preferredGenres: z.array(z.string().trim().min(1).max(40)).max(12),
  preferredEmotions: z.array(z.string().trim().min(1).max(40)).max(12),
  favoriteMovieIds: z.array(z.string().uuid()).max(12).default([]),
  removedFavoriteMovieIds: z.array(z.string().uuid()).max(12).default([]),
  onboardingCompleted: z.boolean().default(true),
});

async function authenticatedClient() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authenticatedClient();
  if (!supabase || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("user_preferences")
    .select(
      "personalization_enabled,preferred_genres,preferred_emotions,onboarding_completed,updated_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  return NextResponse.json({ preferences: data });
}

export async function PUT(request: NextRequest) {
  const { supabase, user } = await authenticatedClient();
  if (!supabase || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = preferencesSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { favoriteMovieIds, removedFavoriteMovieIds, ...preferences } =
    parsed.data;
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      personalization_enabled: preferences.personalizationEnabled,
      preferred_genres: preferences.preferredGenres,
      preferred_emotions: preferences.preferredEmotions,
      onboarding_completed: preferences.onboardingCompleted,
    },
    { onConflict: "user_id" },
  );
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  if (favoriteMovieIds.length) {
    const { error: favoriteError } = await supabase
      .from("user_movie_interactions")
      .upsert(
        favoriteMovieIds.map((movieId) => ({
          user_id: user.id,
          movie_id: movieId,
          status: "NONE",
          is_favorite: true,
        })),
        { onConflict: "user_id,movie_id" },
      );
    if (favoriteError) {
      return NextResponse.json({ error: "favorites_failed" }, { status: 500 });
    }
  }
  if (removedFavoriteMovieIds.length) {
    const { error: removalError } = await supabase
      .from("user_movie_interactions")
      .update({ is_favorite: false })
      .eq("user_id", user.id)
      .in("movie_id", removedFavoriteMovieIds);
    if (removalError) {
      return NextResponse.json({ error: "favorites_failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { supabase, user } = await authenticatedClient();
  if (!supabase || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await Promise.all([
    supabase.from("product_events").delete().eq("user_id", user.id),
    supabase.from("search_feedback").delete().eq("user_id", user.id),
    supabase.from("search_events").delete().eq("user_id", user.id),
  ]);
  if (results.some((result) => result.error)) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
