import "./load-env";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key)
    throw new Error("Supabase service credentials are required");

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cutoff = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
  const { data, error } = await client
    .from("sync_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      errors: [
        {
          message:
            "Stopped because discovery exceeded the intended existing-movie refresh scope",
        },
      ],
    })
    .eq("status", "running")
    .lt("started_at", cutoff)
    .select("id");
  if (error) throw error;
  console.log(JSON.stringify({ closedStaleRuns: data?.length ?? 0 }));
}

void main();
