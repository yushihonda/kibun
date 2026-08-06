export type SearchRelevanceJudgment = {
  tmdbId: number;
  title: string;
  label: "relevant" | "irrelevant";
};

export type SearchRelevanceCase = {
  id: "cry" | "laugh" | "comfort" | "safe";
  query: string;
  relevanceCriteria: string;
  judgments: readonly SearchRelevanceJudgment[];
};

export const SEARCH_RELEVANCE_CASES = [
  {
    id: "cry",
    query: "泣ける",
    relevanceCriteria:
      "悲しみ、別れ、家族や友情の絆などが中心で、感情を解放して泣きたい意図に合う作品",
    judgments: [
      {
        tmdbId: 447365,
        title: "ガーディアンズ・オブ・ギャラクシー：VOLUME 3",
        label: "relevant",
      },
      {
        tmdbId: 489,
        title: "グッド・ウィル・ハンティング／旅立ち",
        label: "relevant",
      },
      { tmdbId: 11036, title: "きみに読む物語", label: "relevant" },
      { tmdbId: 301528, title: "トイ・ストーリー4", label: "relevant" },
      { tmdbId: 424694, title: "ボヘミアン・ラプソディ", label: "relevant" },
      { tmdbId: 11216, title: "ニュー・シネマ・パラダイス", label: "relevant" },
      {
        tmdbId: 4922,
        title: "ベンジャミン・バトン 数奇な人生",
        label: "relevant",
      },
      { tmdbId: 80278, title: "インポッシブル", label: "relevant" },
      { tmdbId: 380, title: "レインマン", label: "relevant" },
      { tmdbId: 57212, title: "戦火の馬", label: "relevant" },
      {
        tmdbId: 14306,
        title: "マーリー 世界一おバカな犬が教えてくれたこと",
        label: "relevant",
      },
      { tmdbId: 77338, title: "最強のふたり", label: "relevant" },
      {
        tmdbId: 713704,
        title: "死霊のはらわた ライジング",
        label: "irrelevant",
      },
      {
        tmdbId: 1114513,
        title: "スピーク・ノー・イーブル 異常な家族",
        label: "irrelevant",
      },
      {
        tmdbId: 414906,
        title: "THE BATMAN－ザ・バットマン－",
        label: "irrelevant",
      },
      {
        tmdbId: 574475,
        title: "ファイナル・デッドブラッド",
        label: "irrelevant",
      },
      { tmdbId: 694, title: "シャイニング", label: "irrelevant" },
      {
        tmdbId: 385687,
        title: "ワイルド・スピード／ファイヤーブースト",
        label: "irrelevant",
      },
      { tmdbId: 497698, title: "ブラック・ウィドウ", label: "irrelevant" },
      {
        tmdbId: 76338,
        title: "マイティ・ソー／ダーク・ワールド",
        label: "irrelevant",
      },
      { tmdbId: 1168190, title: "レッキング・クルー", label: "irrelevant" },
      {
        tmdbId: 16869,
        title: "イングロリアス・バスターズ",
        label: "irrelevant",
      },
      { tmdbId: 9947, title: "エレクトラ", label: "irrelevant" },
      { tmdbId: 12162, title: "ハート・ロッカー", label: "irrelevant" },
    ],
  },
  {
    id: "laugh",
    query: "笑える",
    relevanceCriteria:
      "笑いや軽快さが主目的で、重い緊張を避けて気楽に楽しみたい意図に合う作品",
    judgments: [
      { tmdbId: 90, title: "ビバリーヒルズ・コップ", label: "relevant" },
      { tmdbId: 116149, title: "パディントン", label: "relevant" },
      { tmdbId: 77338, title: "最強のふたり", label: "relevant" },
      { tmdbId: 346698, title: "バービー", label: "relevant" },
      { tmdbId: 137106, title: "LEGO ムービー", label: "relevant" },
      {
        tmdbId: 45243,
        title: "ハングオーバー!! 史上最悪の二日酔い、国境を越える",
        label: "relevant",
      },
      {
        tmdbId: 55721,
        title: "ブライズメイズ 史上最悪のウェディングプラン",
        label: "relevant",
      },
      { tmdbId: 227159, title: "モンスター上司2", label: "relevant" },
      { tmdbId: 521777, title: "グッド・ボーイズ", label: "relevant" },
      { tmdbId: 195589, title: "ネイバーズ", label: "relevant" },
      {
        tmdbId: 280180,
        title: "ビバリーヒルズ・コップ: アクセル・フォーリー",
        label: "relevant",
      },
      { tmdbId: 11688, title: "ラマになった王様", label: "relevant" },
      {
        tmdbId: 713704,
        title: "死霊のはらわた ライジング",
        label: "irrelevant",
      },
      { tmdbId: 694, title: "シャイニング", label: "irrelevant" },
      {
        tmdbId: 574475,
        title: "ファイナル・デッドブラッド",
        label: "irrelevant",
      },
      {
        tmdbId: 414906,
        title: "THE BATMAN－ザ・バットマン－",
        label: "irrelevant",
      },
      {
        tmdbId: 385687,
        title: "ワイルド・スピード／ファイヤーブースト",
        label: "irrelevant",
      },
      { tmdbId: 497698, title: "ブラック・ウィドウ", label: "irrelevant" },
      {
        tmdbId: 16869,
        title: "イングロリアス・バスターズ",
        label: "irrelevant",
      },
      { tmdbId: 12162, title: "ハート・ロッカー", label: "irrelevant" },
      {
        tmdbId: 762441,
        title: "クワイエット・プレイス：DAY 1",
        label: "irrelevant",
      },
      { tmdbId: 882598, title: "スマイル", label: "irrelevant" },
      { tmdbId: 629, title: "ユージュアル・サスペクツ", label: "irrelevant" },
      { tmdbId: 37094, title: "フォーリング・ダウン", label: "irrelevant" },
    ],
  },
  {
    id: "comfort",
    query: "癒やされる",
    relevanceCriteria:
      "温かい関係や穏やかな世界観が中心で、疲れたときに安心して気持ちを整えたい意図に合う作品",
    judgments: [
      { tmdbId: 552524, title: "リロ＆スティッチ", label: "relevant" },
      { tmdbId: 2062, title: "レミーのおいしいレストラン", label: "relevant" },
      { tmdbId: 346648, title: "パディントン２", label: "relevant" },
      { tmdbId: 116149, title: "パディントン", label: "relevant" },
      { tmdbId: 10191, title: "ヒックとドラゴン", label: "relevant" },
      { tmdbId: 823219, title: "Flow", label: "relevant" },
      { tmdbId: 490132, title: "グリーンブック", label: "relevant" },
      { tmdbId: 77338, title: "最強のふたり", label: "relevant" },
      { tmdbId: 82690, title: "シュガー・ラッシュ", label: "relevant" },
      { tmdbId: 11688, title: "ラマになった王様", label: "relevant" },
      { tmdbId: 109445, title: "アナと雪の女王", label: "relevant" },
      { tmdbId: 127380, title: "ファインディング・ドリー", label: "relevant" },
      { tmdbId: 694, title: "シャイニング", label: "irrelevant" },
      {
        tmdbId: 574475,
        title: "ファイナル・デッドブラッド",
        label: "irrelevant",
      },
      {
        tmdbId: 414906,
        title: "THE BATMAN－ザ・バットマン－",
        label: "irrelevant",
      },
      {
        tmdbId: 385687,
        title: "ワイルド・スピード／ファイヤーブースト",
        label: "irrelevant",
      },
      {
        tmdbId: 16869,
        title: "イングロリアス・バスターズ",
        label: "irrelevant",
      },
      { tmdbId: 12162, title: "ハート・ロッカー", label: "irrelevant" },
      {
        tmdbId: 762441,
        title: "クワイエット・プレイス：DAY 1",
        label: "irrelevant",
      },
      { tmdbId: 882598, title: "スマイル", label: "irrelevant" },
      {
        tmdbId: 713704,
        title: "死霊のはらわた ライジング",
        label: "irrelevant",
      },
      {
        tmdbId: 1114513,
        title: "スピーク・ノー・イーブル 異常な家族",
        label: "irrelevant",
      },
      { tmdbId: 1242011, title: "トゥギャザー", label: "irrelevant" },
      { tmdbId: 1339713, title: "オブセッション 災愛", label: "irrelevant" },
    ],
  },
  {
    id: "safe",
    query: "怖くない",
    relevanceCriteria:
      "ホラー、強い恐怖、残虐描写を避け、家族でも安心して楽しみたい意図に合う作品",
    judgments: [
      { tmdbId: 12, title: "ファインディング・ニモ", label: "relevant" },
      { tmdbId: 10681, title: "ウォーリー", label: "relevant" },
      { tmdbId: 812, title: "アラジン", label: "relevant" },
      { tmdbId: 109445, title: "アナと雪の女王", label: "relevant" },
      { tmdbId: 425, title: "アイス・エイジ", label: "relevant" },
      { tmdbId: 11544, title: "リロ・アンド・スティッチ", label: "relevant" },
      { tmdbId: 10386, title: "アイアン・ジャイアント", label: "relevant" },
      { tmdbId: 127380, title: "ファインディング・ドリー", label: "relevant" },
      { tmdbId: 346648, title: "パディントン２", label: "relevant" },
      { tmdbId: 116149, title: "パディントン", label: "relevant" },
      { tmdbId: 10315, title: "ファンタスティック Mr.FOX", label: "relevant" },
      {
        tmdbId: 260513,
        title: "インクレディブル・ファミリー",
        label: "relevant",
      },
      {
        tmdbId: 133121,
        title: "バイオハザード ダムネーション",
        label: "irrelevant",
      },
      {
        tmdbId: 13648,
        title: "バイオハザード ディジェネレーション",
        label: "irrelevant",
      },
      { tmdbId: 567609, title: "レディ・オア・ノット", label: "irrelevant" },
      { tmdbId: 19994, title: "ジェニファーズ・ボディ", label: "irrelevant" },
      { tmdbId: 401561, title: "マッド・ダディ", label: "irrelevant" },
      { tmdbId: 1266127, title: "レディ・オア・ノット2", label: "irrelevant" },
      { tmdbId: 804150, title: "コカイン・ベア", label: "irrelevant" },
      { tmdbId: 694, title: "シャイニング", label: "irrelevant" },
      {
        tmdbId: 574475,
        title: "ファイナル・デッドブラッド",
        label: "irrelevant",
      },
      {
        tmdbId: 713704,
        title: "死霊のはらわた ライジング",
        label: "irrelevant",
      },
      {
        tmdbId: 1114513,
        title: "スピーク・ノー・イーブル 異常な家族",
        label: "irrelevant",
      },
      { tmdbId: 882598, title: "スマイル", label: "irrelevant" },
    ],
  },
] as const satisfies readonly SearchRelevanceCase[];
