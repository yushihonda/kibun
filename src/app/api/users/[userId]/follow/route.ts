import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCommunityUser } from "@/lib/community/route-auth";

async function setFollow(
  request: NextRequest,
  params: Promise<{ userId: string }>,
  following: boolean,
) {
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const auth = await requireCommunityUser(request, {
    nextPath: `/u/${userId}`,
    rateLimit: { namespace: "follow", maxRequests: 30, windowSeconds: 60 },
  });
  if (auth.response) return auth.response;
  if (auth.user.id === userId) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { error } = following
    ? await auth.supabase
        .from("user_follows")
        .upsert(
          { follower_id: auth.user.id, followee_id: userId },
          { onConflict: "follower_id,followee_id", ignoreDuplicates: true },
        )
    : await auth.supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", auth.user.id)
        .eq("followee_id", userId);
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ following });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  return setFollow(request, params, true);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  return setFollow(request, params, false);
}
