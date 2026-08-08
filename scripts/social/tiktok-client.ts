export type TikTokSearchPost = {
  videoId: string;
  url: string;
  caption: string;
  authorUsername?: string;
  regionCode?: string;
  postedAt?: string;
  durationSeconds?: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  hashtags: string[];
  commentSamples: string[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function path(value: unknown, keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    const currentRecord = record(current);
    if (!currentRecord) return undefined;
    current = currentRecord[key];
  }
  return current;
}

function first(value: unknown, paths: string[][]): unknown {
  for (const keys of paths) {
    const candidate = path(value, keys);
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return candidate;
    }
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function count(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function timestamp(value: unknown): string | undefined {
  if (typeof value === "string" && /[T:-]/u.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  const milliseconds = parsed > 10_000_000_000 ? parsed : parsed * 1_000;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function unique(values: string[], limit = 30): string[] {
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, limit);
}

function arrayAt(value: unknown, paths: string[][]): unknown[] {
  for (const keys of paths) {
    const candidate = path(value, keys);
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractHashtags(item: unknown, caption: string): string[] {
  const values: string[] = [];
  for (const tag of arrayAt(item, [
    ["hashtags"],
    ["hashtag_names"],
    ["challenges"],
    ["text_extra"],
  ])) {
    if (typeof tag === "string") values.push(tag.replace(/^#/, ""));
    const tagRecord = record(tag);
    const name = tagRecord
      ? text(
          tagRecord.name ??
            tagRecord.title ??
            tagRecord.hashtag_name ??
            tagRecord.hashtagName,
        )
      : undefined;
    if (name) values.push(name.replace(/^#/, ""));
  }
  for (const match of caption.matchAll(/#([^\s#.,!?、。！？]+)/gu)) {
    if (match[1]) values.push(match[1]);
  }
  return unique(values);
}

function extractCommentSamples(item: unknown): string[] {
  return unique(
    arrayAt(item, [["comments"], ["comment_list"], ["commentList"]]).flatMap(
      (comment) => {
        const value =
          text(comment) ??
          text(first(comment, [["text"], ["comment"], ["description"]]));
        return value ? [value] : [];
      },
    ),
    20,
  );
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    ["data"],
    ["data", "data"],
    ["data", "videos"],
    ["data", "items"],
    ["videos"],
    ["items"],
    ["item_list"],
    ["aweme_list"],
  ];
  return arrayAt(payload, candidates);
}

function safeTikTokUrl(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      !/(^|\.)tiktok\.com$/iu.test(url.hostname)
    ) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseTikTokSearchResponse(
  payload: unknown,
): TikTokSearchPost[] {
  return extractItems(payload).flatMap((item) => {
    const videoId = text(
      first(item, [
        ["id"],
        ["video_id"],
        ["videoId"],
        ["aweme_id"],
        ["video", "id"],
      ]),
    );
    if (!videoId || !/^[A-Za-z0-9_-]{3,128}$/u.test(videoId)) return [];
    const caption =
      text(
        first(item, [
          ["title"],
          ["desc"],
          ["description"],
          ["video_description"],
        ]),
      ) ?? "";
    const authorUsername = text(
      first(item, [
        ["author", "unique_id"],
        ["author", "uniqueId"],
        ["author", "username"],
        ["author", "handle"],
        ["username"],
        ["author_name"],
      ]),
    )?.replace(/^@/, "");
    const suppliedUrl = safeTikTokUrl(
      first(item, [
        ["share_url"],
        ["shareUrl"],
        ["url"],
        ["webVideoUrl"],
        ["video", "share_url"],
      ]),
    );
    const url =
      suppliedUrl ??
      (authorUsername
        ? `https://www.tiktok.com/@${encodeURIComponent(authorUsername)}/video/${encodeURIComponent(videoId)}`
        : `https://www.tiktok.com/video/${encodeURIComponent(videoId)}`);
    const durationRaw = count(
      first(item, [["video_duration"], ["duration"], ["video", "duration"]]),
    );
    const durationSeconds =
      durationRaw > 7_200 ? Math.round(durationRaw / 1_000) : durationRaw;

    return [
      {
        videoId,
        url,
        caption,
        authorUsername,
        regionCode: text(
          first(item, [["region_code"], ["region"], ["author", "region"]]),
        )?.toUpperCase(),
        postedAt: timestamp(
          first(item, [["create_time"], ["createTime"], ["created_at"]]),
        ),
        durationSeconds: durationSeconds || undefined,
        views: count(
          first(item, [
            ["play_count"],
            ["view_count"],
            ["statistics", "play_count"],
            ["statistics", "view_count"],
            ["stats", "playCount"],
            ["statsV2", "playCount"],
          ]),
        ),
        likes: count(
          first(item, [
            ["digg_count"],
            ["like_count"],
            ["statistics", "digg_count"],
            ["statistics", "like_count"],
            ["stats", "diggCount"],
            ["statsV2", "diggCount"],
          ]),
        ),
        comments: count(
          first(item, [
            ["comment_count"],
            ["statistics", "comment_count"],
            ["stats", "commentCount"],
            ["statsV2", "commentCount"],
          ]),
        ),
        shares: count(
          first(item, [
            ["share_count"],
            ["statistics", "share_count"],
            ["stats", "shareCount"],
            ["statsV2", "shareCount"],
          ]),
        ),
        hashtags: extractHashtags(item, caption),
        commentSamples: extractCommentSamples(item),
      },
    ];
  });
}

export class TikTokRapidApiClient {
  constructor(
    private readonly config: {
      apiKey: string;
      host?: string;
      endpoint?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async search(
    keywords: string,
    options?: { region?: string; count?: number },
  ): Promise<TikTokSearchPost[]> {
    const host = this.config.host ?? "tiktok-all-in-one-api.p.rapidapi.com";
    const endpoint = this.config.endpoint ?? `https://${host}/search/video`;
    const url = new URL(endpoint);
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("region", options?.region ?? "JP");
    url.searchParams.set(
      "count",
      String(Math.min(50, Math.max(1, options?.count ?? 30))),
    );
    const response = await (this.config.fetchImpl ?? fetch)(url, {
      headers: {
        accept: "application/json",
        "X-RapidAPI-Key": this.config.apiKey,
        "X-RapidAPI-Host": host,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `TikTok RapidAPI ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("TikTok RapidAPI returned invalid JSON");
    }
    return parseTikTokSearchResponse(payload);
  }
}
