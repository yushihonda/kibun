import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadComments } from "@/lib/community/comments";
import {
  optionalViewer,
  requireCommunityUser,
} from "@/lib/community/route-auth";

const listSchema = z
  .object({
    movieId: z.string().uuid().optional(),
    board: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
    rootId: z.string().uuid().optional(),
    sort: z.enum(["new", "top"]).default("new"),
  })
  .refine(
    (value) => Boolean(value.movieId || value.board || value.rootId),
    "target_required",
  );

const createSchema = z
  .object({
    movieId: z.string().uuid().optional(),
    board: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
    parentId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(120).optional(),
    body: z.string().trim().min(1).max(2000),
    isSpoiler: z.boolean().default(false),
  })
  .refine(
    (value) =>
      Boolean(value.parentId) ||
      Number(Boolean(value.movieId)) + Number(Boolean(value.board)) === 1,
    "target_required",
  )
  .refine(
    (value) => Boolean(value.parentId || !value.board || value.title),
    "title_required",
  );

export async function GET(request: NextRequest) {
  const parsed = listSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { supabase, viewerId } = await optionalViewer(request);
  if (!supabase) return NextResponse.json({ comments: [] });
  try {
    const comments = await loadComments(supabase, {
      ...parsed.data,
      viewerId,
    });
    return NextResponse.json({ comments, viewerId });
  } catch {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { movieId, board, parentId, title, body, isSpoiler } = parsed.data;
  const auth = await requireCommunityUser(request, {
    nextPath: movieId
      ? `/?movie=${movieId}`
      : board
        ? `/community/${board}`
        : "/community",
    rateLimit: { namespace: "comment", maxRequests: 6, windowSeconds: 60 },
  });
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("comments")
    .insert({
      user_id: auth.user.id,
      movie_id: parentId ? null : (movieId ?? null),
      board: parentId ? null : (board ?? null),
      parent_id: parentId ?? null,
      title: parentId ? null : (title ?? null),
      body,
      is_spoiler: isSpoiler,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
