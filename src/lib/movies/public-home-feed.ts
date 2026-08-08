import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { loadHomeFeed } from "@/lib/movies/home-feed";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

const PUBLIC_FEED_TTL_MS = 5 * 60 * 1_000;

type HomeFeed = Awaited<ReturnType<typeof loadHomeFeed>>;

let cachedFeed: { value: HomeFeed; expiresAt: number } | null = null;
let pendingFeed: Promise<HomeFeed> | null = null;

function createPublicClient(): SupabaseClient {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase public configuration is missing");
  return createSupabaseClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadPublicHomeFeed(): Promise<HomeFeed> {
  const now = Date.now();
  if (cachedFeed && cachedFeed.expiresAt > now) return cachedFeed.value;
  if (pendingFeed) return pendingFeed;

  pendingFeed = loadHomeFeed(createPublicClient(), {
    now: new Date(now),
    user: null,
  })
    .then((value) => {
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
