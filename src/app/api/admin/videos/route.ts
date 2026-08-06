import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loginPath } from "@/lib/auth/next-path";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  movieId: z.string().uuid(),
  url: z.string().url(),
  approve: z.boolean().optional().default(false),
});

function extractTikTokVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) return null;
    const fromPath = parsed.pathname.match(/\/video\/(\d+)/);
    if (fromPath?.[1]) return fromPath[1];
    const short = parsed.pathname.match(/^\/t\/([A-Za-z0-9]+)/);
    return short?.[1] ?? null;
  } catch {
    return null;
  }
}

type OEmbedPayload = {
  title?: string;
  author_name?: string;
  html?: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const admin = await requireAdmin(supabase);
  if (admin.error === "unauthorized") {
    return NextResponse.json(
      { error: "unauthorized", loginUrl: loginPath("/admin/videos") },
      { status: 401 },
    );
  }
  if (admin.error === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const videoId = extractTikTokVideoId(parsed.data.url);
  if (!videoId) {
    return NextResponse.json({ error: "invalid_tiktok_url" }, { status: 400 });
  }

  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.data.url)}`;
  const oembedResponse = await fetch(oembedUrl, {
    headers: { accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!oembedResponse.ok) {
    return NextResponse.json({ error: "oembed_failed" }, { status: 400 });
  }
  const oembed = (await oembedResponse.json()) as OEmbedPayload;

  const { data: movie } = await supabase
    .from("movies")
    .select("id")
    .eq("id", parsed.data.movieId)
    .maybeSingle();
  if (!movie) {
    return NextResponse.json({ error: "movie_not_found" }, { status: 404 });
  }

  const status = parsed.data.approve ? "approved" : "pending";
  const { data, error } = await supabase
    .from("movie_videos")
    .upsert(
      {
        movie_id: parsed.data.movieId,
        platform: "tiktok",
        video_id: videoId,
        url: parsed.data.url,
        status,
      },
      { onConflict: "platform,video_id" },
    )
    .select("video_id,status")
    .single();

  if (error || !data) {
    console.error("admin video upsert failed", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({
    videoId: data.video_id,
    title: oembed.title ?? "",
    authorName: oembed.author_name ?? "",
    status: data.status,
  });
}
