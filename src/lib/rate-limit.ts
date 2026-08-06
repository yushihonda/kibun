import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function withinRateLimit(
  request: NextRequest,
  supabase: SupabaseClient,
  options: { namespace: string; maxRequests: number; windowSeconds: number },
): Promise<boolean> {
  const clientAddress =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("user-agent") ??
    "unknown";
  const keyHash = await digest(`${options.namespace}:${clientAddress}`);
  const { data, error } = await supabase.rpc("consume_api_quota", {
    p_key_hash: keyHash,
    p_window_seconds: options.windowSeconds,
    p_max_requests: options.maxRequests,
  });
  // Deployments remain available while a new migration is rolling out.
  if (error) {
    console.error("Rate-limit RPC failed", {
      namespace: options.namespace,
      code: error.code,
    });
    return true;
  }
  return data === true;
}
