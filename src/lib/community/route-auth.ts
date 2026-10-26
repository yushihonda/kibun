import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { loginPath } from "@/lib/auth/next-path";
import { withinRateLimit } from "@/lib/rate-limit";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import { createClient } from "@/lib/supabase/server";

type Authorized = { supabase: SupabaseClient; user: User; response?: never };
type Rejected = { response: NextResponse; supabase?: never; user?: never };

export async function requireCommunityUser(
  request: NextRequest,
  options: {
    nextPath: string;
    rateLimit?: {
      namespace: string;
      maxRequests: number;
      windowSeconds: number;
    };
  },
): Promise<Authorized | Rejected> {
  const unauthorized = () => ({
    response: NextResponse.json(
      { error: "unauthorized", loginUrl: loginPath(options.nextPath) },
      { status: 401 },
    ),
  });
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) return unauthorized();
  const supabase = await createClient();
  if (!supabase) {
    return {
      response: NextResponse.json({ error: "not_configured" }, { status: 503 }),
    };
  }
  if (
    options.rateLimit &&
    !(await withinRateLimit(request, supabase, options.rateLimit))
  ) {
    return {
      response: NextResponse.json({ error: "rate_limited" }, { status: 429 }),
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  return { supabase, user };
}

export async function optionalViewer(request: NextRequest) {
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) {
    return { supabase: await createClient(), viewerId: null };
  }
  const supabase = await createClient();
  if (!supabase) return { supabase, viewerId: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, viewerId: user?.id ?? null };
}
