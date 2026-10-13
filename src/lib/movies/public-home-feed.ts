import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHomeFeed } from "@/lib/movies/home-feed";
import { prioritizeHomeFeedSections } from "@/lib/movies/home-feed-priority";
import { loadPublicSearchLanding } from "@/lib/movies/search-landing";

const PUBLIC_FEED_TTL_MS = 5 * 60 * 1_000;
const PUBLIC_HOME_MOVIE_LIMIT = 48;

type HomeFeed = Awaited<ReturnType<typeof loadHomeFeed>>;

let cachedFeed: { value: HomeFeed; expiresAt: number } | null = null;
let pendingFeed: Promise<HomeFeed> | null = null;

async function loadSearchLandingWithRetry() {
  try {
    return await loadPublicSearchLanding();
  } catch {
    return loadPublicSearchLanding();
  }
}

export async function loadPublicHomeFeed(): Promise<HomeFeed> {
  const now = Date.now();
  if (cachedFeed && cachedFeed.expiresAt > now) return cachedFeed.value;
  if (pendingFeed) return pendingFeed;

  pendingFeed = loadSearchLandingWithRetry()
    .then(({ sections }) => {
      const value = {
        sections: prioritizeHomeFeedSections(sections, {
          limit: PUBLIC_HOME_MOVIE_LIMIT,
        }),
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
