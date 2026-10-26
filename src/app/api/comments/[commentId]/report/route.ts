import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCommunityUser } from "@/lib/community/route-auth";

const reportSchema = z.object({
  reason: z.enum(["spoiler", "harassment", "spam", "inappropriate", "other"]),
  detail: z.string().trim().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(commentId).success || !parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const auth = await requireCommunityUser(request, {
    nextPath: "/community",
    rateLimit: {
      namespace: "comment-report",
      maxRequests: 10,
      windowSeconds: 600,
    },
  });
  if (auth.response) return auth.response;

  const { error } = await auth.supabase.from("comment_reports").upsert(
    {
      comment_id: commentId,
      reporter_id: auth.user.id,
      reason: parsed.data.reason,
      detail: parsed.data.detail || null,
    },
    { onConflict: "comment_id,reporter_id", ignoreDuplicates: true },
  );
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
