import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCommunityUser } from "@/lib/community/route-auth";

const updateSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  isSpoiler: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(commentId).success || !parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const auth = await requireCommunityUser(request, {
    nextPath: "/community",
    rateLimit: {
      namespace: "comment-edit",
      maxRequests: 10,
      windowSeconds: 60,
    },
  });
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("comments")
    .update({ body: parsed.data.body, is_spoiler: parsed.data.isSpoiler })
    .eq("id", commentId)
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  if (!z.string().uuid().safeParse(commentId).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const auth = await requireCommunityUser(request, { nextPath: "/community" });
  if (auth.response) return auth.response;

  const { data: comment } = await auth.supabase
    .from("comments")
    .select("id,reply_count")
    .eq("id", commentId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!comment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Keep a placeholder so the replies under it stay readable.
  const { error } =
    comment.reply_count > 0
      ? await auth.supabase
          .from("comments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", commentId)
      : await auth.supabase.from("comments").delete().eq("id", commentId);
  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
