import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

const actionSchema = z.object({
  action: z.enum(["hide", "dismiss", "restore"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(reportId).success || !parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const auth = await requireAdmin(supabase);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === "unauthorized" ? 401 : 403 },
    );
  }

  const { data: report } = await supabase
    .from("comment_reports")
    .select("comment_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date().toISOString();
  const { action } = parsed.data;
  if (action !== "dismiss") {
    const { error } = await supabase
      .from("comments")
      .update({ hidden_at: action === "hide" ? now : null })
      .eq("id", report.comment_id);
    if (error) {
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
  }
  // Resolve every open report on the same comment together.
  const { error } = await supabase
    .from("comment_reports")
    .update({
      status: action === "dismiss" ? "dismissed" : "resolved",
      resolved_at: now,
    })
    .eq("comment_id", report.comment_id)
    .eq("status", "open");
  if (error)
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
