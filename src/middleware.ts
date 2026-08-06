import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

// OpenNext Cloudflare 1.20 supports Edge Middleware but not Next.js 16's
// Node.js-only Proxy runtime yet. Keep this compatibility entrypoint until the
// adapter adds Node.js Proxy support.
export function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
