import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const startedAt = Date.now();
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { status: "degraded", database: "unconfigured" },
      { status: 503 },
    );
  }
  const { count, error } = await supabase
    .from("movies")
    .select("id", { head: true, count: "planned" });
  const healthy = !error;
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database: healthy ? "reachable" : "error",
      movies: count ?? null,
      moviesCountAccuracy: "estimated",
      responseMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
