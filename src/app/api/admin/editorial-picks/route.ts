import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loginPath } from "@/lib/auth/next-path";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

const upsertSchema = z.object({
  movieId: z.string().uuid(),
  comment: z.string().max(2000).default(""),
  isFeatured: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
});

const deleteSchema = z.object({
  movieId: z.string().uuid(),
});

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const admin = await requireAdmin(supabase);
  if (admin.error === "unauthorized") {
    return NextResponse.json(
      { error: "unauthorized", loginUrl: loginPath("/admin/picks") },
      { status: 401 },
    );
  }
  if (admin.error === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("editorial_picks")
    .select(
      "id,movie_id,comment,is_featured,sort_order,updated_at,movies(title,poster_path)",
    )
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  return NextResponse.json({ picks: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const admin = await requireAdmin(supabase);
  if (admin.error === "unauthorized") {
    return NextResponse.json(
      { error: "unauthorized", loginUrl: loginPath("/admin/picks") },
      { status: 401 },
    );
  }
  if (admin.error === "forbidden" || !admin.user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data: movie } = await supabase
    .from("movies")
    .select("id")
    .eq("id", parsed.data.movieId)
    .maybeSingle();
  if (!movie) {
    return NextResponse.json({ error: "movie_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("editorial_picks")
    .upsert(
      {
        movie_id: parsed.data.movieId,
        admin_user_id: admin.user.id,
        comment: parsed.data.comment.trim(),
        is_featured: parsed.data.isFeatured,
        sort_order: parsed.data.sortOrder,
      },
      { onConflict: "movie_id" },
    )
    .select("id,movie_id,comment,is_featured,sort_order")
    .single();

  if (error || !data) {
    console.error("editorial pick upsert failed", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ pick: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const admin = await requireAdmin(supabase);
  if (admin.error === "unauthorized") {
    return NextResponse.json(
      { error: "unauthorized", loginUrl: loginPath("/admin/picks") },
      { status: 401 },
    );
  }
  if (admin.error === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { error } = await supabase
    .from("editorial_picks")
    .delete()
    .eq("movie_id", parsed.data.movieId);

  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
