import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const config = getSupabasePublicConfig();
  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  const supabase = config
    ? createServerClient(config.url, config.publishableKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) => {
            cookiesToSet.push(...cookies);
          },
        },
      })
    : null;

  if (supabase && (code || (tokenHash && type === "email"))) {
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: "email",
        });
    if (!error) {
      const response = NextResponse.redirect(new URL(next, request.url));
      for (const cookie of cookiesToSet) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
      return response;
    }
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", next);
  login.searchParams.set("error", config ? "oauth" : "config");
  return NextResponse.redirect(login);
}
