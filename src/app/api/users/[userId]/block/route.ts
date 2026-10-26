import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCommunityUser } from "@/lib/community/route-auth";

async function setBlock(
  request: NextRequest,
  params: Promise<{ userId: string }>,
  blocked: boolean,
) {
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const auth = await requireCommunityUser(request, {
    nextPath: `/u/${userId}`,
    rateLimit: { namespace: "block", maxRequests: 30, windowSeconds: 60 },
  });
  if (auth.response) return auth.response;
  if (auth.user.id === userId) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  if (blocked) {
    const { error } = await auth.supabase
      .from("user_blocks")
      .upsert(
        { blocker_id: auth.user.id, blocked_id: userId },
        { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
      );
    if (error) {
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    // Blocking also stops following, in both directions we control.
    await auth.supabase
      .from("user_follows")
      .delete()
      .eq("follower_id", auth.user.id)
      .eq("followee_id", userId);
  } else {
    const { error } = await auth.supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", auth.user.id)
      .eq("blocked_id", userId);
    if (error) {
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ blocked });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  return setBlock(request, params, true);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  return setBlock(request, params, false);
}
