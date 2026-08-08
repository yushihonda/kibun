import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHomeFeed } from "@/lib/movies/home-feed";
import { loadPublicSearchLanding } from "@/lib/movies/search-landing";

const PUBLIC_FEED_TTL_MS = 5 * 60 * 1_000;

type HomeFeed = Awaited<ReturnType<typeof loadHomeFeed>>;

let cachedFeed: { value: HomeFeed; expiresAt: number } | null = null;
let pendingFeed: Promise<HomeFeed> | null = null;

export async function loadPublicHomeFeed(): Promise<HomeFeed> {
  const now = Date.now();
  if (cachedFeed && cachedFeed.expiresAt > now) return cachedFeed.value;
  if (pendingFeed) return pendingFeed;

  pendingFeed = loadPublicSearchLanding()
    .then(({ sections }) => {
      const value = {
        sections,
        personalized: false,
        generatedAt: new Date(now).toISOString(),
      } satisfies HomeFeed;
      cachedFeed = { value, expiresAt: Date.now() + PUBLIC_FEED_TTL_MS };
      return value;
    })
    .finally(() => {
      pendingFeed = null;
    });
  return pendingFeed;
}

export async function loadRequestHomeFeed(
  supabase: SupabaseClient,
): Promise<HomeFeed> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? loadHomeFeed(supabase, { user }) : loadPublicHomeFeed();
}
