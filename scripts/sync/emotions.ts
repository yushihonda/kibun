import { HttpError, isRetryableHttpError, withRetry } from "./retry";
import { EMOTION_VOCABULARY, type EmotionTag, type TmdbDetails } from "./types";
import { MANUAL_MOVIE_METADATA } from "./manual-metadata";
import { CURATED_SEARCH_EMOTIONS } from "../search-evaluation/curated-emotions";

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export type EmotionProfile = {
  tags: EmotionTag[];
  scores: Record<string, number>;
  source: string;
};

type EmotionRule = {
  tag: EmotionTag;
  genres?: string[];
  terms: string[];
  weight: number;
};

const RULES: EmotionRule[] = [
  {
    tag: "泣ける",
    genres: ["ドラマ"],
    terms: ["別れ", "喪失", "死", "涙", "家族", "再会", "余命", "愛する人"],
    weight: 0.22,
  },
  {
    tag: "笑える",
    genres: ["コメディ"],
    terms: ["コメディ", "笑い", "騒動", "ドタバタ", "ユーモア", "愉快"],
    weight: 0.24,
  },
  {
    tag: "癒やし",
    genres: ["ファミリー"],
    terms: ["日常", "穏やか", "優しい", "動物", "暮らし", "自然", "心温まる"],
    weight: 0.2,
  },
  {
    tag: "心温まる",
    genres: ["ファミリー", "ドラマ"],
    terms: ["家族", "友情", "絆", "成長", "希望", "優しい", "再会"],
    weight: 0.18,
  },
  {
    tag: "爽快",
    genres: ["アクション", "アドベンチャー"],
    terms: ["ヒーロー", "決戦", "ミッション", "復讐", "戦い", "最強"],
    weight: 0.2,
  },
  {
    tag: "高揚感",
    genres: ["アクション", "音楽", "アドベンチャー"],
    terms: ["挑戦", "夢", "ステージ", "レース", "勝利", "冒険"],
    weight: 0.18,
  },
  {
    tag: "緊張感",
    genres: ["スリラー", "犯罪", "謎"],
    terms: ["事件", "殺人", "脱出", "陰謀", "捜査", "危機", "追跡"],
    weight: 0.2,
  },
  {
    tag: "怖い",
    genres: ["ホラー"],
    terms: ["恐怖", "呪い", "幽霊", "悪霊", "怪物", "惨劇"],
    weight: 0.24,
  },
  {
    tag: "不穏",
    genres: ["ホラー", "スリラー"],
    terms: ["失踪", "秘密", "異変", "狂気", "不気味", "謎"],
    weight: 0.18,
  },
  {
    tag: "ロマンチック",
    genres: ["ロマンス"],
    terms: ["恋", "愛", "恋人", "結婚", "運命の人", "ラブストーリー"],
    weight: 0.22,
  },
  {
    tag: "切ない",
    genres: ["ドラマ", "ロマンス"],
    terms: ["別れ", "叶わない", "すれ違い", "孤独", "喪失", "過去"],
    weight: 0.18,
  },
  {
    tag: "考えさせられる",
    genres: ["ドキュメンタリー", "ドラマ"],
    terms: ["社会", "人生", "真実", "葛藤", "選択", "差別", "戦争"],
    weight: 0.17,
  },
  {
    tag: "希望",
    genres: ["ファミリー", "アドベンチャー"],
    terms: ["希望", "再起", "未来", "夢", "勇気", "成長"],
    weight: 0.18,
  },
  {
    tag: "ノスタルジック",
    genres: ["ドラマ"],
    terms: ["青春", "思い出", "故郷", "幼なじみ", "あの頃", "記憶"],
    weight: 0.2,
  },
];

function clampScore(value: number): number {
  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}

function addScore(scores: Record<string, number>, tag: string, value: number) {
  scores[tag] = clampScore(Math.max(scores[tag] ?? 0, value));
}

export function deriveRuleEmotionScores(
  movie: TmdbDetails,
): Record<string, number> {
  const genres = new Set(movie.genres.map((genre) => genre.name));
  const keywords =
    movie.keywords?.keywords.map((keyword) => keyword.name) ?? [];
  const reviewSummary = (movie.reviews?.results ?? [])
    .slice(0, 3)
    .map((review) => review.content.slice(0, 600))
    .join(" ");
  const text = [
    movie.title,
    movie.overview,
    movie.tagline,
    ...keywords,
    reviewSummary,
  ]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
  const scores: Record<string, number> = {};

  for (const rule of RULES) {
    const genreHits = (rule.genres ?? []).filter((genre) =>
      genres.has(genre),
    ).length;
    const termHits = rule.terms.filter((term) =>
      text.includes(term.toLocaleLowerCase("ja")),
    ).length;
    if (!genreHits && !termHits) continue;
    addScore(
      scores,
      rule.tag,
      0.25 + genreHits * 0.18 + Math.min(termHits, 3) * rule.weight,
    );
  }

  return scores;
}

export function buildEmotionProfile(
  movie: TmdbDetails,
  options?: {
    existingScores?: Record<string, number>;
    databaseOverrides?: Record<string, number>;
    aiTags?: EmotionTag[];
  },
): EmotionProfile {
  const scores: Record<string, number> = {};
  const sources = new Set<string>();
  for (const [tag, score] of Object.entries(options?.existingScores ?? {})) {
    addScore(scores, tag, Number(score) * 0.95);
  }

  const ruleScores = deriveRuleEmotionScores(movie);
  if (Object.keys(ruleScores).length) sources.add("rules");
  for (const [tag, score] of Object.entries(ruleScores))
    addScore(scores, tag, score);

  const curated =
    movie.media_type === "movie"
      ? (MANUAL_MOVIE_METADATA[movie.id]?.emotionScores ?? {})
      : {};
  const searchCurated =
    movie.media_type === "movie"
      ? (CURATED_SEARCH_EMOTIONS[movie.id] ?? {})
      : {};
  if (Object.keys(curated).length || Object.keys(searchCurated).length) {
    sources.add("curated");
  }
  for (const [tag, score] of Object.entries({ ...searchCurated, ...curated })) {
    addScore(scores, tag, Number(score));
  }

  if (
    options?.databaseOverrides &&
    Object.keys(options.databaseOverrides).length
  ) {
    sources.add("human_override");
    for (const [tag, score] of Object.entries(options.databaseOverrides)) {
      addScore(scores, tag, Number(score));
    }
  }

  if (options?.aiTags?.length) {
    sources.add("ai_capped");
    for (const tag of options.aiTags) addScore(scores, tag, 0.76);
  }

  const vocabulary = new Set<string>(EMOTION_VOCABULARY);
  const tags = Object.entries(scores)
    .filter(([tag, score]) => vocabulary.has(tag) && score >= 0.4)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, 5)
    .map(([tag]) => tag as EmotionTag);

  return {
    tags,
    scores,
    source: [...sources].join("+") || "unclassified",
  };
}

export async function generateEmotionTags(
  movie: TmdbDetails,
  apiKey: string | undefined,
  model = "gpt-4o-mini",
): Promise<EmotionTag[]> {
  if (!apiKey) return [];

  const response = await withRetry(
    async () => {
      const result = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "作品情報から視聴時の感情を推定し、固定語彙から最大3件だけ選んでください。",
            },
            {
              role: "user",
              content: JSON.stringify({
                title: movie.title,
                overview: movie.overview,
                genres: movie.genres.map((genre) => genre.name),
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "movie_emotions",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["tags"],
                properties: {
                  tags: {
                    type: "array",
                    maxItems: 3,
                    items: { type: "string", enum: EMOTION_VOCABULARY },
                  },
                },
              },
            },
          },
        }),
      });
      if (!result.ok) {
        throw new HttpError(
          `OpenAI ${result.status}: ${await result.text()}`,
          result.status,
        );
      }
      return (await result.json()) as OpenAiResponse;
    },
    { shouldRetry: isRetryableHttpError },
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no structured content");
  const parsed = JSON.parse(content) as { tags?: unknown };
  if (!Array.isArray(parsed.tags)) throw new Error("OpenAI tags are invalid");
  const vocabulary = new Set<string>(EMOTION_VOCABULARY);
  const tags: unknown[] = parsed.tags;
  return [
    ...new Set(
      tags.filter(
        (tag): tag is EmotionTag =>
          typeof tag === "string" && vocabulary.has(tag),
      ),
    ),
  ].slice(0, 3);
}
