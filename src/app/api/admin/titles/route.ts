import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { buildEmotionProfile } from "../../../../../scripts/sync/emotions";
import {
  mapJapaneseProviders,
  mapTmdbMovie,
} from "../../../../../scripts/sync/mapping";
import { SyncStore } from "../../../../../scripts/sync/supabase";
import { TmdbClient } from "../../../../../scripts/sync/tmdb";

const importSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
});

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function authorize() {
  const supabase = await createClient();
  if (!supabase) return { error: "unavailable" as const };
  const auth = await requireAdmin(supabase);
  return auth.error ? { error: auth.error } : { error: null };
}

export async function GET(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === "unauthorized" ? 401 : 403 },
    );
  }
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  try {
    const response = await new TmdbClient(required("TMDB_BEARER_TOKEN")).search(
      query,
    );
    return NextResponse.json({
      results: response.results.slice(0, 20).map((title) => ({
        tmdbId: title.id,
        mediaType: title.media_type,
        title: title.title,
        originalTitle: title.original_title,
        overview: title.overview,
        releaseDate: title.release_date ?? "",
        posterUrl: title.poster_path
          ? `https://image.tmdb.org/t/p/w342${title.poster_path}`
          : "/placeholder-movie.svg",
      })),
    });
  } catch (error) {
    console.error("Admin TMDB search failed", error);
    return NextResponse.json({ error: "tmdb_search_failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === "unauthorized" ? 401 : 403 },
    );
  }
  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { mediaType, tmdbId } = parsed.data;
  try {
    const tmdb = new TmdbClient(required("TMDB_BEARER_TOKEN"));
    const store = new SyncStore(
      required("NEXT_PUBLIC_SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const [details, existing] = await Promise.all([
      tmdb.details(tmdbId, mediaType),
      store.existingMovieMeta(mediaType, tmdbId),
    ]);
    const emotionProfile = buildEmotionProfile(details, {
      existingScores: existing.emotionScores,
      databaseOverrides: existing.emotionOverrides,
      aiTags: existing.emotionTags,
    });
    const syncedAt = new Date().toISOString();
    const title = mapTmdbMovie(details, [], emotionProfile, syncedAt);
    const providers = mapJapaneseProviders(details, syncedAt);

    await store.upsertMovie(title);
    await Promise.all([
      store.replaceProviders(mediaType, tmdbId, providers, syncedAt),
      store.syncYouTubeVideo(mediaType, tmdbId, title.youtube_video_key),
    ]);

    return NextResponse.json({
      imported: true,
      title: {
        tmdbId,
        mediaType,
        title: title.title,
        providerCount: providers.length,
        hasVideo: Boolean(title.youtube_video_key),
      },
    });
  } catch (error) {
    console.error("Admin title import failed", { mediaType, tmdbId, error });
    return NextResponse.json({ error: "title_import_failed" }, { status: 500 });
  }
}
