import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCommunityUser } from "@/lib/community/route-auth";

async function setLike(
  request: NextRequest,
  params: Promise<{ commentId: string }>,
  liked: boolean,
) {
  const { commentId } = await params;
  if (!z.string().uuid().safeParse(commentId).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const auth = await requireCommunityUser(request, {
    nextPath: "/community",
    rateLimit: {
      namespace: "comment-like",
      maxRequests: 60,
      windowSeconds: 60,
    },
  });
  if (auth.response) return auth.response;

  const { error } = liked
    ? await auth.supabase
        .from("comment_likes")
        .upsert(
          { comment_id: commentId, user_id: auth.user.id },
          { onConflict: "comment_id,user_id", ignoreDuplicates: true },
        )
    : await auth.supabase
        .from("comment_likes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", auth.user.id);
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ liked });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  return setLike(request, params, true);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  return setLike(request, params, false);
}
