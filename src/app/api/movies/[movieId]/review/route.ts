import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loginPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";
import { withinRateLimit } from "@/lib/rate-limit";

const reviewSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> },
) {
  const { movieId } = await params;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ review: null });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !z.string().uuid().safeParse(movieId).success) {
    return NextResponse.json({ review: null });
  }
  const { data, error } = await supabase
    .from("reviews")
    .select("body,updated_at")
    .eq("user_id", user.id)
    .eq("movie_id", movieId)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  return NextResponse.json({ review: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> },
) {
  const { movieId } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (
    !(await withinRateLimit(request, supabase, {
      namespace: "review",
      maxRequests: 10,
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

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reviews")
    .upsert(
      { user_id: user.id, movie_id: movieId, body: parsed.data.body },
      { onConflict: "user_id,movie_id" },
    )
    .select("id,body,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ review: data });
}
