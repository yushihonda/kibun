import type { Movie } from "@/types/movie";

const image = (path: string, size: "w780" | "w1280" = "w1280") =>
  `https://image.tmdb.org/t/p/${size}${path}`;

export const demoMovies: Movie[] = [
  {
    id: "demo-dune-2",
    tmdbId: 693134,
    title: "デューン 砂の惑星 PART2",
    originalTitle: "Dune: Part Two",
    overview:
      "復讐と愛、そして宇宙の運命。砂の惑星で青年ポールが選ぶ未来を、圧倒的な映像と音で描く。",
    posterUrl: image("/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg", "w780"),
    backdropUrl: image("/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"),
    releaseDate: "2024-03-15",
    runtime: 166,
    voteAverage: 8.1,
    popularity: 92,
    genres: ["SF", "アドベンチャー"],
    emotionalTags: ["映像美", "没入感", "壮大", "一人でじっくり"],
    providers: [
      { id: 9, name: "Prime Video", slug: "prime-video", type: "rent" },
      { id: 84, name: "U-NEXT", slug: "u-next", type: "rent" },
    ],
    video: { platform: "youtube", videoId: "Way9Dexny3w" },
    editorialComment:
      "巨大スケールの世界観に身を預けたい夜。難しいことは考えず、砂嵐と鼓に呑まれる一本。",
  },
  {
    id: "demo-perfect-days",
    tmdbId: 976893,
    title: "PERFECT DAYS",
    overview:
      "東京で静かに暮らす男の日々。同じようで少しずつ違う毎日が、音楽と木漏れ日の中で輝き出す。",
    posterUrl: image("/mjEk5Wwx6TYVqw29zSaUHclMIgp.jpg", "w780"),
    backdropUrl: image("/6OnoMgGFuZ921eV8v8yEyX5P5H.jpg"),
    releaseDate: "2023-12-22",
    runtime: 124,
    voteAverage: 7.8,
    popularity: 76,
    genres: ["ドラマ"],
    emotionalTags: ["チルい", "心が整う", "音楽が良い", "余韻", "癒やし"],
    providers: [{ id: 8, name: "Netflix", slug: "netflix", type: "flatrate" }],
    video: { platform: "youtube", videoId: "HTgWYojq-z8" },
    editorialComment:
      "疲れた日の処方箋。日常の解像度が上がる、静かで優しい邦画のお気に入り。",
  },
  {
    id: "demo-mad-max",
    tmdbId: 76341,
    title: "マッドマックス 怒りのデス・ロード",
    originalTitle: "Mad Max: Fury Road",
    overview:
      "荒廃した世界を突っ走る、怒涛のノンストップ・チェイス。難しいことを考えず熱狂したい夜に。",
    posterUrl: image("/hA2ple9q4qnwxp3hKVNhroipsir.jpg", "w780"),
    backdropUrl: image("/nlCHUWjY9XWbuEUQauCBgnY8ymF.jpg"),
    releaseDate: "2015-06-20",
    runtime: 120,
    voteAverage: 7.6,
    popularity: 83,
    genres: ["アクション", "SF"],
    emotionalTags: [
      "スカッとする",
      "テンポが良い",
      "爆音推奨",
      "酒のアテ",
      "爽快",
    ],
    providers: [
      { id: 119, name: "Hulu", slug: "hulu", type: "flatrate" },
      { id: 9, name: "Prime Video", slug: "prime-video", type: "rent" },
    ],
    video: { platform: "youtube", videoId: "hEJnMQG9ev8" },
  },
  {
    id: "demo-past-lives",
    tmdbId: 666277,
    title: "パスト ライブス／再会",
    originalTitle: "Past Lives",
    overview:
      "幼なじみの二人が、24年の時を経てニューヨークで再会する。もしもを抱えた大人のための物語。",
    posterUrl: image("/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg", "w780"),
    backdropUrl: image("/rron9HAuS9s7zBF8iCX1tsafxUo.jpg"),
    releaseDate: "2024-04-05",
    runtime: 106,
    voteAverage: 7.7,
    popularity: 70,
    genres: ["ロマンス", "ドラマ"],
    emotionalTags: ["エモい", "切ない", "余韻", "静かな夜に", "泣ける"],
    providers: [{ id: 84, name: "U-NEXT", slug: "u-next", type: "flatrate" }],
    video: { platform: "youtube", videoId: "kA244xewjcI" },
    editorialComment:
      "泣ける系で外したくないときの本命。声を大にして泣かなくても、胸の奥がしっとり濡れる。",
  },
  {
    id: "demo-topgun",
    tmdbId: 361743,
    title: "トップガン マーヴェリック",
    overview:
      "伝説のパイロットが若き精鋭たちと不可能な任務へ。王道の熱さと爽快感を大画面で。",
    posterUrl: image("/62HCnUTziyWcpDaBO2i1DX17ljH.jpg", "w780"),
    backdropUrl: image("/AaV1YIdWKnjAIAOe8UUKBFm327v.jpg"),
    releaseDate: "2022-05-27",
    runtime: 131,
    voteAverage: 8.2,
    popularity: 89,
    genres: ["アクション", "ドラマ"],
    emotionalTags: ["胸が熱い", "爽快", "万人受け", "デート向き", "笑える"],
    providers: [
      { id: 337, name: "Disney+", slug: "disney-plus", type: "flatrate" },
    ],
    video: { platform: "youtube", videoId: "qSqVVswa420" },
  },
];
