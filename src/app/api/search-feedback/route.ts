import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withinRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

const feedbackSchema = z.object({
  sessionId: z.string().uuid(),
  query: z.string().trim().min(1).max(500),
  movieId: z.string().uuid(),
  isRelevant: z.boolean(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (
    !(await withinRateLimit(request, supabase, {
      namespace: "search-feedback",
      maxRequests: 30,
      windowSeconds: 60,
    }))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = feedbackSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const user = hasSupabaseAuthCookie(request.cookies.getAll())
    ? (await supabase.auth.getUser()).data.user
    : null;
  const { error } = await supabase.from("search_feedback").insert({
    user_id: user?.id ?? null,
    session_id: parsed.data.sessionId,
    query: parsed.data.query,
    movie_id: parsed.data.movieId,
    is_relevant: parsed.data.isRelevant,
  });
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
