import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withinRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

const eventSchema = z.object({
  sessionId: z.string().uuid(),
  eventName: z.enum([
    "search",
    "zero_results",
    "impression",
    "movie_click",
    "save",
    "playback_start",
    "detail_view",
    "share",
    "recommendation_feedback",
  ]),
  movieId: z.string().uuid().nullable().optional(),
  sectionId: z.string().trim().max(80).nullable().optional(),
  query: z.string().trim().max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  if (
    !(await withinRateLimit(request, supabase, {
      namespace: "events",
      maxRequests: 120,
      windowSeconds: 60,
    }))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const user = hasSupabaseAuthCookie(request.cookies.getAll())
    ? (await supabase.auth.getUser()).data.user
    : null;
  const { error } = await supabase.from("product_events").insert({
    user_id: user?.id ?? null,
    session_id: parsed.data.sessionId,
    event_name: parsed.data.eventName,
    movie_id: parsed.data.movieId ?? null,
    section_id: parsed.data.sectionId ?? null,
    query: parsed.data.query ?? null,
    metadata: parsed.data.metadata,
  });
  return error
    ? NextResponse.json({ error: "save_failed" }, { status: 500 })
    : NextResponse.json({ ok: true }, { status: 201 });
}
