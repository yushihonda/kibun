import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mapFeaturedPosts } from "@/lib/social/map-signals";
import { createClient } from "@/lib/supabase/server";

// Feeds leave TikTok post previews out of their payload; the detail sheet
// fetches them here when it opens.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> },
) {
  const { movieId } = await params;
  if (!z.string().uuid().safeParse(movieId).success) {
    return NextResponse.json({ error: "invalid_movie" }, { status: 400 });
  }
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ featuredPosts: [] });
  const { data, error } = await supabase
    .from("movie_social_signals")
    .select("featured_posts")
    .eq("movie_id", movieId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  return NextResponse.json(
    { featuredPosts: mapFeaturedPosts(data?.featured_posts) },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
