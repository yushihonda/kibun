import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "./config";
import { createContentSecurityPolicy } from "@/lib/security/csp";

export async function updateSupabaseSession(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
  );
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const makeResponse = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  const config = getSupabasePublicConfig();
  if (!config) {
    const unconfiguredResponse = makeResponse();
    unconfiguredResponse.headers.set(
      "Content-Security-Policy",
      contentSecurityPolicy,
    );
    return unconfiguredResponse;
  }

  const hasAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  if (!hasAuthCookie) {
    const anonymousResponse = makeResponse();
    anonymousResponse.headers.set(
      "Content-Security-Policy",
      contentSecurityPolicy,
    );
    return anonymousResponse;
  }

  let response = makeResponse();
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = makeResponse();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}
