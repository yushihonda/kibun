import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCommunityUser } from "@/lib/community/route-auth";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  bio: z.string().trim().max(300),
  shelfPublic: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  const parsed = profileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const auth = await requireCommunityUser(request, {
    nextPath: "/me",
    rateLimit: { namespace: "profile", maxRequests: 10, windowSeconds: 60 },
  });
  if (auth.response) return auth.response;

  const { error } = await auth.supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio || null,
      shelf_public: parsed.data.shelfPublic,
    })
    .eq("id", auth.user.id);
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
