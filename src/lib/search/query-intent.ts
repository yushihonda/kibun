import type { Movie } from "@/types/movie";
import {
  findSocialSignalMatch,
  socialSignalMatchReason,
} from "@/lib/search/social-signal-match";
import { isFreshSocialTrend, socialTrendBoost } from "@/lib/discovery/ranking";

type IntentProfile = {
  id: string;
  label: string;
  patterns: readonly RegExp[];
  queries: readonly string[];
  genres: Readonly<Record<string, number>>;
  terms: readonly string[];
  emotionalTags?: readonly string[];
  avoidGenres?: Readonly<Record<string, number>>;
};

export type PlannedQuery = {
  text: string;
  weight: number;
  source: "literal" | "intent" | "fallback";
};

export type SearchPlan = {
  originalQuery: string;
  normalizedQuery: string;
  queries: PlannedQuery[];
  labels: string[];
  preferredGenres: Record<string, number>;
  avoidedGenres: Record<string, number>;
  preferredTerms: string[];
  preferredEmotionalTags: string[];
  inferredMaxRuntime: number | null;
  inferredMinRating: number | null;
  inferredMinVoteCount: number | null;
  inferredProviderSlugs: string[];
  inferredOriginCountries: string[];
  expanded: boolean;
};

export type SearchReason = {
  label: string;
  kind: "mood" | "genre" | "rating" | "popularity" | "title" | "tag";
};

export type SearchPersonalization = {
  preferredGenres: string[];
  preferredEmotionalTags: string[];
};

type RankedMovie = Pick<
  Movie,
  | "id"
  | "title"
  | "originalTitle"
  | "overview"
  | "genres"
  | "emotionalTags"
  | "emotionScores"
  | "voteAverage"
  | "popularity"
  | "socialSignals"
>;

export type SearchBatch<T extends RankedMovie> = {
  query: PlannedQuery;
  movies: T[];
};

const profiles: readonly IntentProfile[] = [
  {
    id: "cry",
    label: "泣ける・感動",
    patterns: [
      /^(?:泣ける|号泣|涙活)$/u,
      /泣きたい/u,
      /泣いて/u,
      /泣こう/u,
      /泣ける/u,
      /号泣/u,
      /涙活/u,
      /涙したい/u,
      /涙(?:が|も)?(?:出|こぼ)/u,
      /感動(?:したい|できる|する|系)?/u,
      /胸を打/u,
      /切な(?:い|さ)/u,
      /しんみり/u,
    ],
    queries: ["ドラマ", "家族", "友情", "別れ", "喪失", "感動"],
    genres: {
      ドラマ: 3.5,
      ロマンス: 1,
      ファミリー: 2,
      アニメーション: 0.5,
    },
    terms: [
      "家族",
      "友情",
      "別れ",
      "喪失",
      "再会",
      "人生",
      "絆",
      "感動",
      "涙",
      "死別",
      "両親",
      "親子",
    ],
    emotionalTags: ["泣ける", "感動", "切ない", "エモい", "余韻"],
    avoidGenres: { ホラー: 2 },
  },
  {
    id: "comfort",
    label: "癒やし・心温まる",
    patterns: [
      /^(?:癒やされる|癒し|癒やし)$/u,
      /癒/u,
      /疲れた/u,
      /疲れ(?:た|て)/u,
      /しんどい/u,
      /落ち込/u,
      /ほっこり/u,
      /心温ま/u,
      /穏やか/u,
      /安心したい/u,
      /優しい(?:映画|作品|話)/u,
      /じんわり/u,
      /やすらぎ/u,
    ],
    queries: ["ファミリー", "ドラマ", "家族", "友情", "日常", "癒し"],
    genres: { ファミリー: 4, ドラマ: 2, コメディ: 2, アニメーション: 1.5 },
    terms: [
      "日常",
      "家族",
      "友情",
      "再会",
      "成長",
      "希望",
      "心",
      "小さな",
      "穏やか",
      "温かい",
      "優しい",
    ],
    emotionalTags: ["癒やし", "心が整う", "チルい", "ほっこり", "心温まる"],
    avoidGenres: { ホラー: 5, スリラー: 3, 犯罪: 1 },
  },
  {
    id: "laugh",
    label: "笑える・気楽",
    patterns: [
      /^(?:笑える|爆笑|コメディ)$/u,
      /笑いたい/u,
      /笑える/u,
      /爆笑/u,
      /面白い(?:映画|作品|やつ)?/u,
      /何も考えず/u,
      /頭を空っぽ/u,
      /気楽に/u,
      /ネタが(?:うまい|上手い)/u,
      /くすっ/u,
    ],
    queries: ["コメディ", "ユーモア", "騒動", "仲間", "笑い"],
    genres: { コメディ: 6, アニメーション: 1.5, ファミリー: 1.5 },
    terms: [
      "笑い",
      "ユーモア",
      "騒動",
      "ドタバタ",
      "仲間",
      "コメディ",
      "ギャグ",
    ],
    emotionalTags: ["笑える", "気楽", "テンポが良い", "酒のアテ"],
    avoidGenres: { ホラー: 4, スリラー: 2, 戦争: 2 },
  },
  {
    id: "uplifting",
    label: "元気・前向き",
    patterns: [
      /元気(?:に|が|を|出)/u,
      /前向き/u,
      /気分を上げ/u,
      /希望/u,
      /勇気/u,
      /背中を押/u,
      /やる気/u,
      /パワーが欲しい/u,
    ],
    queries: ["コメディ", "アドベンチャー", "夢", "挑戦", "希望"],
    genres: { コメディ: 3, アドベンチャー: 3, ファミリー: 2, 音楽: 2 },
    terms: ["夢", "挑戦", "希望", "成長", "勇気", "仲間", "成功", "再起"],
    emotionalTags: ["前向き", "元気が出る", "胸が熱い", "万人受け"],
    avoidGenres: { ホラー: 3 },
  },
  {
    id: "refreshing",
    label: "爽快・スカッと",
    patterns: [
      /^(?:スカッと|爽快)$/u,
      /スカッ/u,
      /爽快/u,
      /ストレス発散/u,
      /テンション(?:を)?上げ/u,
      /アガる/u,
      /熱くな/u,
      /興奮したい/u,
      /ぶち抜/u,
    ],
    queries: ["アクション", "アドベンチャー", "戦い", "ヒーロー"],
    genres: { アクション: 6, アドベンチャー: 4, サイエンスフィクション: 2 },
    terms: ["戦い", "決戦", "ヒーロー", "復讐", "救う", "最強", "ミッション"],
    emotionalTags: ["スカッとする", "爽快", "爆音推奨", "テンポが良い"],
  },
  {
    id: "suspense",
    label: "ハラハラ・謎解き",
    patterns: [
      /ハラハラ/u,
      /ドキドキ/u,
      /緊張感/u,
      /謎解き/u,
      /どんでん返し/u,
      /先が読めない/u,
      /サスペンス/u,
      /スリラー/u,
    ],
    queries: ["スリラー", "謎", "犯罪", "秘密", "事件"],
    genres: { スリラー: 6, 謎: 5, 犯罪: 3 },
    terms: ["事件", "秘密", "失踪", "殺人", "真相", "陰謀", "捜査"],
    emotionalTags: ["ハラハラ", "緊張感", "どんでん返し"],
  },
  {
    id: "scary",
    label: "怖い・不穏",
    patterns: [
      /^(?:怖い|ホラー)$/u,
      /怖い(?:映画|作品|やつ)(?:が|を|見|観|欲)/u,
      /怖がりたい/u,
      /ホラー(?:が|を)(?:見|観)たい/u,
      /ホラー映画/u,
      /不穏/u,
      /ゾッと/u,
      /肝試し/u,
    ],
    queries: ["ホラー", "恐怖", "怪物", "呪い", "悪霊"],
    genres: { ホラー: 7, スリラー: 3, 謎: 1 },
    terms: ["恐怖", "怪物", "呪い", "悪霊", "幽霊", "殺人", "不気味"],
    emotionalTags: ["怖い", "不穏", "ゾッとする"],
  },
  {
    id: "romance",
    label: "恋愛・ロマンチック",
    patterns: [
      /^(?:恋愛|ロマンス)$/u,
      /恋愛/u,
      /ロマンチック/u,
      /キュン/u,
      /恋人と/u,
      /カップルで/u,
      /デート(?:で|に|向き)/u,
      /ラブストーリー/u,
      /恋(?:が|を|の)?(?:したい|したい気分)?/u,
    ],
    queries: ["ロマンス", "恋", "愛", "出会い"],
    genres: { ロマンス: 7, ドラマ: 2, コメディ: 1.5 },
    terms: ["恋", "愛", "出会い", "二人", "結婚", "運命", "再会"],
    emotionalTags: ["ロマンチック", "キュン", "デート向き", "切ない"],
    avoidGenres: { ホラー: 2 },
  },
  {
    id: "thoughtful",
    label: "深い・考えさせられる",
    patterns: [
      /考えさせ/u,
      /深い(?:映画|作品|話)/u,
      /哲学/u,
      /社会派/u,
      /余韻(?:が|に|を|の)?/u,
      /じっくり(?:見|観)/u,
      /人生について/u,
    ],
    queries: ["ドラマ", "ドキュメンタリー", "人生", "社会", "真実"],
    genres: { ドラマ: 5, ドキュメンタリー: 4, 履歴: 1.5 },
    terms: ["人生", "社会", "真実", "葛藤", "孤独", "選択", "記憶", "世界"],
    emotionalTags: ["余韻", "考えさせられる", "一人でじっくり"],
  },
  {
    id: "quiet",
    label: "静か・余韻",
    patterns: [
      /一人で/u,
      /ひとりで/u,
      /静かな/u,
      /静かに/u,
      /まったり/u,
      /落ち着い/u,
      /寝る前/u,
      /雨の日/u,
      /夜に(?:見|観)/u,
    ],
    queries: ["ドラマ", "日常", "人生", "旅", "暮らし"],
    genres: { ドラマ: 4, ロマンス: 1, ドキュメンタリー: 1 },
    terms: ["日常", "人生", "孤独", "旅", "静か", "暮らし", "町", "記憶"],
    emotionalTags: ["静か", "余韻", "チルい", "静かな夜に"],
    avoidGenres: { アクション: 3, ホラー: 4 },
  },
  {
    id: "immersive",
    label: "没入・現実逃避",
    patterns: [
      /現実逃避/u,
      /没入/u,
      /別世界/u,
      /壮大/u,
      /映像美/u,
      /世界観/u,
      /非日常/u,
    ],
    queries: [
      "ファンタジー",
      "サイエンスフィクション",
      "アドベンチャー",
      "世界",
      "宇宙",
    ],
    genres: {
      ファンタジー: 6,
      サイエンスフィクション: 5,
      アドベンチャー: 4,
      アニメーション: 1,
    },
    terms: ["世界", "宇宙", "冒険", "王国", "未来", "魔法", "旅", "壮大"],
    emotionalTags: ["映像美", "没入感", "壮大", "世界観"],
  },
  {
    id: "nostalgic",
    label: "懐かしい・エモい",
    patterns: [
      /懐かし/u,
      /ノスタルジ/u,
      /エモい/u,
      /青春/u,
      /あの頃/u,
      /昔を思い/u,
    ],
    queries: ["ドラマ", "青春", "思い出", "故郷", "再会"],
    genres: { ドラマ: 4, ロマンス: 2, 音楽: 2 },
    terms: ["青春", "思い出", "故郷", "再会", "記憶", "少年", "少女", "学生"],
    emotionalTags: ["エモい", "懐かしい", "青春"],
  },
  {
    id: "family",
    label: "家族で楽しめる",
    patterns: [
      /家族で/u,
      /親子で/u,
      /子どもと/u,
      /子供と/u,
      /みんなで(?:見|観)/u,
    ],
    queries: ["ファミリー", "アニメーション", "冒険", "家族"],
    genres: {
      ファミリー: 7,
      アニメーション: 5,
      アドベンチャー: 2,
      コメディ: 2,
    },
    terms: ["家族", "冒険", "友情", "成長", "仲間"],
    emotionalTags: ["万人受け", "家族向け", "子どもと"],
    avoidGenres: { ホラー: 8, スリラー: 4, 犯罪: 3 },
  },
  {
    id: "music",
    label: "音楽・高揚感",
    patterns: [
      /音楽が(?:いい|良い)/u,
      /音楽映画/u,
      /ライブ感/u,
      /歌(?:が|を|の)/u,
      /踊りたい/u,
    ],
    queries: ["音楽", "歌", "バンド", "ミュージシャン"],
    genres: { 音楽: 8, ドラマ: 1.5, コメディ: 1 },
    terms: ["音楽", "歌", "バンド", "ステージ", "ミュージシャン", "ダンス"],
    emotionalTags: ["音楽が良い", "ライブ感"],
  },
] as const;

const safeViewingPatterns = [
  /怖くない/u,
  /怖いのは(?:苦手|嫌)/u,
  /ホラー(?:は|が)?(?:苦手|嫌|以外|なし)/u,
  /グロ(?:く)?ない/u,
  /グロ(?:は|が)?(?:苦手|嫌|なし)/u,
];

const genericRecommendationPatterns = [
  /おすすめ/u,
  /お薦め/u,
  /何か(?:いい|面白い)?(?:映画|作品)/u,
  /なんか(?:いい|面白い)?(?:映画|作品)/u,
  /(?:映画|作品)(?:が|を)?(?:見たい|観たい)/u,
  /いい映画/u,
];

const regionalMatchers = [
  {
    label: "邦画",
    query: "邦画",
    country: "JP",
    pattern: /邦画|日本映画|日本の(?:映画|作品)/u,
  },
  {
    label: "韓国映画",
    query: "韓国映画",
    country: "KR",
    pattern: /韓国(?:系|映画|作品)|韓流|k[- ]?(?:movie|film)/iu,
  },
] as const;

const providerMatchers = [
  { slug: "netflix", pattern: /netflix|ネットフリックス|ネトフリ/iu },
  {
    slug: "prime-video",
    pattern: /prime\s*video|amazon\s*prime|プライムビデオ|アマプラ/iu,
  },
  { slug: "u-next", pattern: /u[-‐ー]?next|ユーネクスト/iu },
  { slug: "disney-plus", pattern: /disney\+|disney\s*plus|ディズニープラス/iu },
  { slug: "hulu", pattern: /hulu|フールー/iu },
  { slug: "apple-tv", pattern: /apple\s*tv|アップルtv/iu },
  { slug: "fod", pattern: /fod|フジテレビオンデマンド/iu },
] as const;

const explicitGenres = [
  ["アクション", /アクション/u],
  ["コメディ", /コメディ|コメディー/u],
  ["ホラー", /ホラー/u],
  ["ロマンス", /ロマンス|恋愛/u],
  ["サイエンスフィクション", /\bsf\b|sci[- ]?fi|サイエンスフィクション/iu],
  ["ファンタジー", /ファンタジー/u],
  ["アニメーション", /アニメ/u],
  ["ドキュメンタリー", /ドキュメンタリー/u],
  ["スリラー", /スリラー|サスペンス/u],
] as const;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function addWeights(
  target: Record<string, number>,
  source: Readonly<Record<string, number>>,
) {
  for (const [key, weight] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + weight;
  }
}

function inferRuntime(query: string): number | null {
  const minutes = query.match(/(\d{2,3})\s*分(?:以内|まで|くらい|程度)/u);
  if (minutes) return Math.min(Math.max(Number(minutes[1]), 30), 300);

  const hours = query.match(/([12](?:\.5)?)\s*時間(?:以内|まで|くらい|程度)/u);
  if (hours) return Math.round(Number(hours[1]) * 60);

  return /短め|短い映画|サクッと|時間がない|すぐ見終わ/u.test(query)
    ? 105
    : null;
}

export function analyzeSearchQuery(input: string): SearchPlan {
  const originalQuery = input.trim().slice(0, 500);
  const normalizedQuery = normalize(originalQuery);
  const matchedProfiles = profiles.filter((profile) =>
    profile.patterns.some((pattern) => pattern.test(normalizedQuery)),
  );
  const safeViewing = safeViewingPatterns.some((pattern) =>
    pattern.test(normalizedQuery),
  );
  const genericRecommendation = genericRecommendationPatterns.some((pattern) =>
    pattern.test(normalizedQuery),
  );
  const regionalIntents = regionalMatchers.filter(({ pattern }) =>
    pattern.test(normalizedQuery),
  );
  const preferredGenres: Record<string, number> = {};
  const avoidedGenres: Record<string, number> = {};
  const preferredTerms: string[] = [];
  const preferredEmotionalTags: string[] = [];
  const labels: string[] = [];

  for (const profile of matchedProfiles) {
    labels.push(profile.label);
    addWeights(preferredGenres, profile.genres);
    if (profile.avoidGenres) addWeights(avoidedGenres, profile.avoidGenres);
    preferredTerms.push(...profile.terms);
    if (profile.emotionalTags)
      preferredEmotionalTags.push(...profile.emotionalTags);
  }

  if (safeViewing) {
    labels.push("怖くない・安心");
    addWeights(preferredGenres, { コメディ: 3, ファミリー: 3, ドラマ: 1 });
    addWeights(avoidedGenres, { ホラー: 10, スリラー: 3 });
    preferredTerms.push("友情", "家族", "日常", "笑い");
    preferredEmotionalTags.push("万人受け", "ほっこり", "心温まる");
  }

  for (const [genre, pattern] of explicitGenres) {
    if (pattern.test(normalizedQuery) && !(genre === "ホラー" && safeViewing)) {
      preferredGenres[genre] = (preferredGenres[genre] ?? 0) + 7;
    }
  }

  const inferredMaxRuntime = inferRuntime(normalizedQuery);
  if (inferredMaxRuntime) labels.push(`${inferredMaxRuntime}分以内`);

  const inferredMinRating =
    /評価(?:が)?高い|高評価|名作|外れ(?:が)?ない|間違いない/u.test(
      normalizedQuery,
    )
      ? 7.5
      : null;
  const inferredMinVoteCount =
    regionalIntents.length > 0 &&
    (genericRecommendation || matchedProfiles.length > 0 || safeViewing)
      ? 50
      : null;
  if (inferredMinRating) labels.push("高評価");
  if (genericRecommendation && matchedProfiles.length === 0 && !safeViewing) {
    labels.push("おすすめ");
  }
  labels.push(...regionalIntents.map(({ label }) => label));

  const inferredProviderSlugs = providerMatchers
    .filter(({ pattern }) => pattern.test(normalizedQuery))
    .map(({ slug }) => slug);
  const inferredOriginCountries = regionalIntents.map(({ country }) => country);

  const queryCandidates: PlannedQuery[] = originalQuery
    ? [{ text: originalQuery, weight: 8, source: "literal" }]
    : [];

  for (const { query } of regionalIntents) {
    queryCandidates.push({ text: query, weight: 5, source: "intent" });
  }
  for (const genre of Object.keys(preferredGenres).sort(
    (a, b) => preferredGenres[b] - preferredGenres[a],
  )) {
    queryCandidates.push({ text: genre, weight: 3, source: "intent" });
  }
  for (const profile of matchedProfiles) {
    for (const text of profile.queries) {
      queryCandidates.push({ text, weight: 2.5, source: "intent" });
    }
  }
  if (safeViewing) {
    for (const text of ["コメディ", "ファミリー", "日常"]) {
      queryCandidates.push({ text, weight: 2.5, source: "intent" });
    }
  }
  const regionalQueries = regionalIntents.map(({ query }) => query);
  const scopedQueryCandidates = queryCandidates.map((candidate) => {
    if (
      candidate.source !== "intent" ||
      regionalQueries.length === 0 ||
      regionalQueries.includes(
        candidate.text as (typeof regionalQueries)[number],
      )
    ) {
      return candidate;
    }

    return {
      ...candidate,
      text: `${regionalQueries.join(" ")} ${candidate.text}`,
    };
  });
  const queries = scopedQueryCandidates
    .filter(
      (candidate, index, items) =>
        items.findIndex(
          (item) => normalize(item.text) === normalize(candidate.text),
        ) === index,
    )
    .slice(0, 6);

  const hasInterpretation =
    matchedProfiles.length > 0 ||
    safeViewing ||
    inferredMaxRuntime !== null ||
    inferredMinRating !== null ||
    inferredProviderSlugs.length > 0 ||
    genericRecommendation ||
    regionalIntents.length > 0;

  if (
    hasInterpretation &&
    queries.length === 1 &&
    matchedProfiles.length === 0 &&
    Object.keys(preferredGenres).length === 0 &&
    (genericRecommendation ||
      inferredMaxRuntime !== null ||
      inferredMinRating !== null ||
      inferredProviderSlugs.length > 0) &&
    regionalIntents.length === 0
  ) {
    queries.push({ text: "", weight: 1, source: "fallback" });
  }

  return {
    originalQuery,
    normalizedQuery,
    queries,
    labels: [...new Set(labels)],
    preferredGenres,
    avoidedGenres,
    preferredTerms: [...new Set(preferredTerms)],
    preferredEmotionalTags: [...new Set(preferredEmotionalTags)],
    inferredMaxRuntime,
    inferredMinRating,
    inferredMinVoteCount,
    inferredProviderSlugs,
    inferredOriginCountries,
    expanded: hasInterpretation || queries.length > 1,
  };
}

type ScoreBreakdown = {
  total: number;
  title: number;
  mood: number;
  genre: number;
  rating: number;
  popularity: number;
  social: number;
};

function scoreBreakdown(movie: RankedMovie, plan: SearchPlan): ScoreBreakdown {
  const title = normalize(
    [movie.title, movie.originalTitle].filter(Boolean).join(" "),
  );
  const haystack = normalize(
    [movie.title, movie.originalTitle, movie.overview, ...movie.emotionalTags]
      .filter(Boolean)
      .join(" "),
  );

  let titleScore = 0;
  if (plan.normalizedQuery && title === plan.normalizedQuery) titleScore = 120;
  else if (plan.normalizedQuery && title.includes(plan.normalizedQuery))
    titleScore = 45;

  let genreScore = 0;
  for (const genre of movie.genres) {
    genreScore += (plan.preferredGenres[genre] ?? 0) * 6;
    genreScore -= (plan.avoidedGenres[genre] ?? 0) * 8;
  }

  let moodScore = 0;
  const moodSignals = [
    ...plan.preferredEmotionalTags,
    ...plan.preferredTerms,
  ].map(normalize);
  for (const tag of movie.emotionalTags) {
    const normalizedTag = normalize(tag);
    const intensity = movie.emotionScores?.[tag] ?? 0.7;
    if (
      plan.preferredEmotionalTags.some((preferred) =>
        normalizedTag.includes(normalize(preferred)),
      )
    ) {
      moodScore += 18 * intensity;
    } else if (
      plan.preferredTerms.some((term) =>
        normalizedTag.includes(normalize(term)),
      )
    ) {
      moodScore += 12 * intensity;
    }
  }
  for (const term of plan.preferredTerms) {
    if (haystack.includes(normalize(term))) moodScore += 2.5;
  }
  for (const preferred of plan.preferredEmotionalTags) {
    if (haystack.includes(normalize(preferred))) moodScore += 4;
  }
  // Deduplicate mood signal noise when both tags and terms fire heavily.
  moodScore = Math.min(moodScore, 55 + moodSignals.length);

  const moodPriority =
    plan.preferredEmotionalTags.length > 0 ||
    plan.preferredTerms.length > 0 ||
    Object.keys(plan.preferredGenres).length > 0;
  const ratingScore = moodPriority
    ? Math.min(movie.voteAverage, 10) * 0.25
    : Math.min(movie.voteAverage, 10) * 0.55;
  const popularityScore = moodPriority
    ? Math.log10(Math.max(movie.popularity, 0) + 1) * 0.1
    : Math.log10(Math.max(movie.popularity, 0) + 1) * 0.25;
  const socialTrendScore = Math.min(14, socialTrendBoost(movie) * 0.65);
  const socialMatch = findSocialSignalMatch(
    plan.originalQuery,
    movie.socialSignals,
  );
  const socialScore = Math.min(
    34,
    socialTrendScore + (socialMatch?.score ?? 0) * 20,
  );

  return {
    title: titleScore,
    mood: moodScore,
    genre: genreScore,
    rating: ratingScore,
    popularity: popularityScore,
    social: socialScore,
    total:
      titleScore +
      moodScore +
      genreScore +
      ratingScore +
      popularityScore +
      socialScore,
  };
}

function personalizationBreakdown(
  movie: RankedMovie,
  plan: SearchPlan,
  personalization?: SearchPersonalization | null,
): { score: number; reason?: string } {
  if (!personalization) return { score: 0 };
  if (movie.genres.some((genre) => (plan.avoidedGenres[genre] ?? 0) > 0)) {
    return { score: 0 };
  }
  const preferredGenres = new Set(
    personalization.preferredGenres.map(normalize),
  );
  const matchedGenre = movie.genres.find(
    (genre) =>
      preferredGenres.has(normalize(genre)) &&
      (plan.avoidedGenres[genre] ?? 0) <= 0,
  );
  const matchedEmotion = movie.emotionalTags.find((tag) =>
    personalization.preferredEmotionalTags.some((preferred) => {
      const normalizedTag = normalize(tag);
      const normalizedPreferred = normalize(preferred);
      return (
        normalizedTag.includes(normalizedPreferred) ||
        normalizedPreferred.includes(normalizedTag)
      );
    }),
  );
  const genreScore = Math.min(
    4,
    movie.genres.filter(
      (genre) =>
        preferredGenres.has(normalize(genre)) &&
        (plan.avoidedGenres[genre] ?? 0) <= 0,
    ).length * 2,
  );
  const emotionScore = Math.min(
    4,
    movie.emotionalTags.filter((tag) =>
      personalization.preferredEmotionalTags.some((preferred) => {
        const normalizedTag = normalize(tag);
        const normalizedPreferred = normalize(preferred);
        return (
          normalizedTag.includes(normalizedPreferred) ||
          normalizedPreferred.includes(normalizedTag)
        );
      }),
    ).length * 2,
  );
  const reason = matchedEmotion
    ? `好みの「${matchedEmotion}」に近い`
    : matchedGenre
      ? `好みの${matchedGenre}に近い`
      : undefined;
  return { score: Math.min(8, genreScore + emotionScore), reason };
}

export function explainMovieReasons(
  movie: RankedMovie,
  plan: SearchPlan,
): string[] {
  const socialMatch = findSocialSignalMatch(
    plan.originalQuery,
    movie.socialSignals,
  );
  if (!plan.expanded && !socialMatch) return [];

  const reasons: string[] = [];
  const breakdown = scoreBreakdown(movie, plan);
  const title = normalize(
    [movie.title, movie.originalTitle].filter(Boolean).join(" "),
  );

  if (breakdown.title >= 120) reasons.push("タイトル一致");
  else if (breakdown.title >= 45) reasons.push("タイトルに近い");
  if (socialMatch) reasons.push(socialSignalMatchReason(socialMatch));

  const matchedTags = movie.emotionalTags.filter((tag) => {
    const normalizedTag = normalize(tag);
    return (
      plan.preferredEmotionalTags.some((preferred) =>
        normalizedTag.includes(normalize(preferred)),
      ) ||
      plan.preferredTerms.some((term) =>
        normalizedTag.includes(normalize(term)),
      )
    );
  });
  if (matchedTags.length) {
    reasons.push(`気分タグ「${matchedTags[0]}」`);
  } else if (breakdown.mood >= 8) {
    const moodLabel = plan.labels.find(
      (label) => !/分以内|高評価|おすすめ|邦画|韓国/.test(label),
    );
    if (moodLabel) reasons.push(moodLabel);
  }

  const matchedGenre = movie.genres.find(
    (genre) => (plan.preferredGenres[genre] ?? 0) >= 2,
  );
  if (matchedGenre) reasons.push(`${matchedGenre}寄り`);

  if (movie.voteAverage >= 7.5) reasons.push("高評価");
  else if (breakdown.rating >= 2 && movie.voteAverage >= 7)
    reasons.push(`★${movie.voteAverage.toFixed(1)}`);

  if (movie.popularity >= 70 && reasons.length < 3) reasons.push("話題作");
  if (
    isFreshSocialTrend(movie) &&
    breakdown.social >= 4 &&
    reasons.length < 3
  ) {
    reasons.push("TikTokで話題");
  }

  if (
    plan.normalizedQuery &&
    !reasons.includes("タイトル一致") &&
    title.includes(plan.normalizedQuery)
  ) {
    reasons.unshift("タイトルに近い");
  }

  return [...new Set(reasons)].slice(0, 3);
}

export function rankSearchBatchesWithScores<T extends RankedMovie>(
  batches: readonly SearchBatch<T>[],
  plan: SearchPlan,
  personalization?: SearchPersonalization | null,
): Array<{ movie: T; score: number; reasons: string[] }> {
  const merged = new Map<string, { movie: T; retrievalScore: number }>();

  for (const batch of batches) {
    batch.movies.forEach((movie, index) => {
      const current = merged.get(movie.id) ?? { movie, retrievalScore: 0 };
      current.retrievalScore += (batch.query.weight * 40) / (12 + index);
      merged.set(movie.id, current);
    });
  }

  return [...merged.values()]
    .map(({ movie, retrievalScore }) => {
      const semantic = scoreBreakdown(movie, plan);
      const personalized = personalizationBreakdown(
        movie,
        plan,
        personalization,
      );
      const reasons = explainMovieReasons(movie, plan);
      if (personalized.reason && reasons.length < 3) {
        reasons.push(personalized.reason);
      }
      return {
        movie,
        score: retrievalScore + semantic.total + personalized.score,
        reasons,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.movie.voteAverage - a.movie.voteAverage ||
        b.movie.popularity - a.movie.popularity ||
        a.movie.id.localeCompare(b.movie.id),
    );
}

export function rankSearchBatches<T extends RankedMovie>(
  batches: readonly SearchBatch<T>[],
  plan: SearchPlan,
  personalization?: SearchPersonalization | null,
): T[] {
  return rankSearchBatchesWithScores(batches, plan, personalization).map(
    ({ movie }) => movie,
  );
}
