import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loginPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";
import { withinRateLimit } from "@/lib/rate-limit";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

const inputSchema = z
  .object({
    status: z.enum(["WATCHED", "WATCHLIST", "NONE"]).optional(),
    isFavorite: z.boolean().optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.isFavorite !== undefined ||
      value.rating !== undefined,
    "更新内容がありません",
  );

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> },
) {
  const { movieId } = await params;
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) {
    return NextResponse.json({ interaction: null, authenticated: false });
  }
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json({ interaction: null, authenticated: false });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !z.string().uuid().safeParse(movieId).success) {
    return NextResponse.json({
      interaction: null,
      authenticated: Boolean(user),
    });
  }
  const { data, error } = await supabase
    .from("user_movie_interactions")
    .select("status,is_favorite,rating")
    .eq("user_id", user.id)
    .eq("movie_id", movieId)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  return NextResponse.json({ interaction: data, authenticated: true });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> },
) {
  const { movieId } = await params;
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) {
    return NextResponse.json(
      { error: "unauthorized", loginUrl: loginPath(`/?movie=${movieId}`) },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (
    !(await withinRateLimit(request, supabase, {
      namespace: "interaction",
      maxRequests: 30,
      windowSeconds: 60,
    }))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", loginUrl: loginPath(`/?movie=${movieId}`) },
      { status: 401 },
    );
  }
  if (!z.string().uuid().safeParse(movieId).success) {
    return NextResponse.json({ error: "invalid_movie" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data: current } = await supabase
    .from("user_movie_interactions")
    .select("status,is_favorite,rating")
    .eq("user_id", user.id)
    .eq("movie_id", movieId)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    movie_id: movieId,
    status: parsed.data.status ?? current?.status ?? "NONE",
    is_favorite: parsed.data.isFavorite ?? current?.is_favorite ?? false,
    rating:
      parsed.data.rating !== undefined
        ? parsed.data.rating
        : (current?.rating ?? null),
  };

  const { data, error } = await supabase
    .from("user_movie_interactions")
    .upsert(payload, { onConflict: "user_id,movie_id" })
    .select("status,is_favorite,rating")
    .single();

  if (error) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ interaction: data });
}
