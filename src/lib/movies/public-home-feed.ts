import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { readEdgeJson, writeEdgeJson } from "@/lib/cache/edge-json";
import { loadHomeFeed } from "@/lib/movies/home-feed";
import { prioritizeHomeFeedSections } from "@/lib/movies/home-feed-priority";
import { loadPublicSearchLanding } from "@/lib/movies/search-landing";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

const PUBLIC_FEED_TTL_SECONDS = 5 * 60;
const PUBLIC_FEED_CACHE_KEY = "public-home-feed-v2";
const PUBLIC_HOME_MOVIE_LIMIT = 48;

type HomeFeed = Awaited<ReturnType<typeof loadHomeFeed>>;

let cachedFeed: { value: HomeFeed; expiresAt: number } | null = null;
let pendingFeed: Promise<HomeFeed> | null = null;

// Visitors without an account see the same trend-led feed as signed-in
// viewers who have no history yet.
async function buildTrendFeed(): Promise<HomeFeed> {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase public configuration is missing");
  const supabase = createSupabaseClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const feed = await loadHomeFeed(supabase, { user: null });
  if (!feed.sections.length) throw new Error("Trend feed is empty");
  return {
    ...feed,
    sections: prioritizeHomeFeedSections(feed.sections, {
      limit: PUBLIC_HOME_MOVIE_LIMIT,
    }),
  };
}

async function buildLandingFeed(now: number): Promise<HomeFeed> {
  const { sections } = await loadPublicSearchLanding();
  return {
    sections: prioritizeHomeFeedSections(sections, {
      limit: PUBLIC_HOME_MOVIE_LIMIT,
    }),
    personalized: false,
    generatedAt: new Date(now).toISOString(),
  };
}

export async function loadPublicHomeFeed(): Promise<HomeFeed> {
  const now = Date.now();
  if (cachedFeed && cachedFeed.expiresAt > now) return cachedFeed.value;
  if (pendingFeed) return pendingFeed;

  pendingFeed = readEdgeJson<HomeFeed>(PUBLIC_FEED_CACHE_KEY)
    .then(async (edgeValue) => {
      if (edgeValue?.sections.length) return edgeValue;
      try {
        const value = await buildTrendFeed();
        await writeEdgeJson(
          PUBLIC_FEED_CACHE_KEY,
          value,
          PUBLIC_FEED_TTL_SECONDS,
        );
        return value;
      } catch (error) {
        console.error("Trend home feed failed; using search landing", error);
        return buildLandingFeed(now);
      }
    })
    .then((value) => {
      cachedFeed = {
        value,
        expiresAt: Date.now() + PUBLIC_FEED_TTL_SECONDS * 1_000,
      };
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
