import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  EmotionTag,
  MediaType,
  MovieRecord,
  ProviderRecord,
  SyncFailure,
} from "./types";

export class SyncStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async startRun(source = "tmdb-catalog"): Promise<string> {
    const { data, error } = await this.client
      .from("sync_runs")
      .insert({
        source,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return String(data.id);
  }

  async listTrackedMovies(): Promise<
    Array<{ tmdbId: number; mediaType: MediaType; sources: string[] }>
  > {
    const rows: Array<{
      tmdb_id: number | null;
      media_type: MediaType;
      sources: string[] | null;
    }> = [];
    const pageSize = 1_000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from("movies")
        .select("tmdb_id,media_type,sources")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as typeof rows));
      if ((data?.length ?? 0) < pageSize) break;
    }
    return rows
      .filter(
        (row): row is typeof row & { tmdb_id: number } => row.tmdb_id !== null,
      )
      .map((row) => ({
        tmdbId: row.tmdb_id,
        mediaType: row.media_type,
        sources: row.sources ?? [],
      }));
  }

  async finishRun(
    id: string,
    status: "succeeded" | "failed",
    counts: { discovered: number; succeeded: number; failed: number },
    failures: SyncFailure[],
  ): Promise<void> {
    const { error } = await this.client
      .from("sync_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        discovered_count: counts.discovered,
        succeeded_count: counts.succeeded,
        failed_count: counts.failed,
        errors: failures,
      })
      .eq("id", id);
    if (error) throw error;
  }

  async existingMovieMeta(
    mediaType: MediaType,
    tmdbId: number,
  ): Promise<{
    syncedHash: string | null;
    emotionTags: EmotionTag[];
    emotionScores: Record<string, number>;
    emotionOverrides: Record<string, number>;
  }> {
    const { data, error } = await this.client
      .from("movies")
      .select("id,synced_hash,ai_emotion_tags,emotional_scores")
      .eq("tmdb_id", tmdbId)
      .eq("media_type", mediaType)
      .maybeSingle();
    if (error) throw error;
    const overrides: Record<string, number> = {};
    if (data?.id) {
      const { data: rows, error: overrideError } = await this.client
        .from("movie_emotion_overrides")
        .select("tag,intensity")
        .eq("movie_id", data.id);
      if (overrideError && overrideError.code !== "42P01") throw overrideError;
      for (const row of rows ?? []) {
        overrides[String(row.tag)] = Number(row.intensity);
      }
    }
    return {
      syncedHash: data?.synced_hash ?? null,
      emotionTags: (data?.ai_emotion_tags ?? []) as EmotionTag[],
      emotionScores:
        data?.emotional_scores && typeof data.emotional_scores === "object"
          ? (data.emotional_scores as Record<string, number>)
          : {},
      emotionOverrides: overrides,
    };
  }

  async upsertMovie(movie: MovieRecord): Promise<void> {
    const {
      cast,
      directors,
      genres,
      emotion_tags,
      emotional_scores,
      runtime_minutes,
      trending_at,
      theatrical_at,
      ...movieFields
    } = movie;
    const { error } = await this.client.from("movies").upsert(
      {
        ...movieFields,
        runtime: runtime_minutes,
        genres: genres.map((genre) => genre.name),
        emotional_tags: emotion_tags,
        tmdb_cast: cast,
        tmdb_directors: directors,
        tmdb_genres: genres,
        ai_emotion_tags: emotion_tags,
        emotional_scores,
        ...(trending_at ? { trending_at } : {}),
        ...(theatrical_at ? { theatrical_at } : {}),
      },
      { onConflict: "media_type,tmdb_id" },
    );
    if (error) throw error;
  }

  async syncYouTubeVideo(
    mediaType: MediaType,
    tmdbMovieId: number,
    videoKey: string | null,
  ): Promise<void> {
    if (!videoKey) return;

    const { data: movie, error: movieError } = await this.client
      .from("movies")
      .select("id")
      .eq("tmdb_id", tmdbMovieId)
      .eq("media_type", mediaType)
      .single();
    if (movieError) throw movieError;

    const { error } = await this.client.from("movie_videos").upsert(
      {
        movie_id: movie.id,
        platform: "youtube",
        video_id: videoKey,
        url: `https://www.youtube.com/watch?v=${videoKey}`,
        status: "approved",
      },
      { onConflict: "platform,video_id" },
    );
    if (error) throw error;
  }

  async replaceProviders(
    mediaType: MediaType,
    tmdbMovieId: number,
    providers: ProviderRecord[],
    syncedAt: string,
  ): Promise<void> {
    const { data: movie, error: movieError } = await this.client
      .from("movies")
      .select("id")
      .eq("tmdb_id", tmdbMovieId)
      .eq("media_type", mediaType)
      .single();
    if (movieError) throw movieError;
    const { data: previousRows, error: previousError } = await this.client
      .from("movie_providers")
      .select("offer_type,providers(tmdb_provider_id)")
      .eq("movie_id", movie.id)
      .eq("country", "JP");
    if (previousError) throw previousError;
    const { error } = await this.client.rpc("replace_movie_providers", {
      p_tmdb_movie_id: tmdbMovieId,
      p_providers: providers,
      p_synced_at: syncedAt,
      p_media_type: mediaType,
    });
    if (error) throw error;
    const availableKeys = new Set(
      providers.map(
        (provider) => `${provider.provider_id}:${provider.provider_type}`,
      ),
    );
    const history = providers.map((provider) => ({
      movie_id: movie.id,
      tmdb_provider_id: provider.provider_id,
      offer_type: provider.provider_type,
      is_available: true,
      checked_at: syncedAt,
    }));
    for (const row of previousRows ?? []) {
      const joined = Array.isArray(row.providers)
        ? row.providers[0]
        : row.providers;
      const providerId = joined?.tmdb_provider_id;
      if (!providerId) continue;
      const key = `${providerId}:${row.offer_type}`;
      if (!availableKeys.has(key)) {
        history.push({
          movie_id: movie.id,
          tmdb_provider_id: providerId,
          offer_type: row.offer_type,
          is_available: false,
          checked_at: syncedAt,
        });
      }
    }
    if (history.length) {
      const { error: historyError } = await this.client
        .from("provider_availability_history")
        .upsert(history, {
          onConflict: "movie_id,tmdb_provider_id,offer_type,checked_at",
        });
      if (historyError) throw historyError;
    }
    const { error: timestampError } = await this.client
      .from("movies")
      .update({ providers_checked_at: syncedAt })
      .eq("tmdb_id", tmdbMovieId)
      .eq("media_type", mediaType);
    if (timestampError) throw timestampError;
  }
}
