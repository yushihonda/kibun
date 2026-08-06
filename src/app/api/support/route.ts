import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withinRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.string().email().max(254).or(z.literal("")),
  category: z.enum(["question", "privacy", "deletion", "copyright", "other"]),
  body: z.string().trim().min(10).max(4000),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (
    !(await withinRateLimit(request, supabase, {
      namespace: "support",
      maxRequests: 5,
      windowSeconds: 3600,
    }))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("support_requests").insert({
    user_id: user?.id ?? null,
    email: parsed.data.email || user?.email || null,
    category: parsed.data.category,
    body: parsed.data.body,
  });
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
