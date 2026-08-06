# KIBUN

気分・空き時間・配信サービスから、次に観たい映画を見つける映画DB型メディアです。

## 現在の公開状況

- 本番URL: https://kibun.kibun-jp.workers.dev
- Web: Next.js 16 + Cloudflare Workers（OpenNext）
- DB / Auth: Supabase Free
- 検索: Supabase PostgreSQL + PGroonga + pg_trgm
- 映画データ: TMDB APIから8,191件を同期済み（承認済み動画あり6,695件、感情タグ付与7,873件、2026-08-06監査）
- 本番の `/api/search` がデモではなくSupabase実データを返すことを確認済み
- TOPフィード: 承認済みYouTube予告編がある実作品だけを表示
- Meilisearchは使用せず、初期運用を無料枠で完結

アプリ実装、DB migration、本番データ補完、権限監査、PC・モバイルE2E、GitHub管理とActions本番デプロイまで完了しています。Googleログインは任意機能であり、本番公開そのものには不要です。残る所有者作業は、Googleログインを一般公開する場合の規約同意、実端末確認、所有ドメインの接続です。

## ローカル起動

```bash
cp .env.example .env.local
npm install
npm run dev
```

http://localhost:3000 を開きます。外部サービス未設定時はデモ映画と検索フォールバックで表示できます。

## 外部サービス

- Supabase: PostgreSQL、Auth、お気に入り、評価、レビュー
- Supabase PGroonga / pg_trgm: 日本語全文検索と表記ゆれ検索
- TMDB: 映画情報、画像、ジャンル、評価、配信状況、予告編情報
- YouTube（任意）: 追加の予告編情報
- OpenAI（任意）: 感情タグ生成
- Google OAuth（任意）: 「Googleで続ける」によるログイン
- Cloudflare Workers: Next.jsアプリの公開

環境変数は `.env.example` を参照してください。`SUPABASE_SERVICE_ROLE_KEY` と各APIキーをブラウザへ公開しないでください。Supabase未設定時はビルドとデモ表示が動作し、検索APIもデモデータへフォールバックします。

## データベース

```bash
supabase link --project-ref ovvezqqdkqcqselwulvl
supabase db push
```

主なmigration:

- `0001_initial.sql`: 拡張、テーブル、RLS、Authトリガー、検索インデックス、`search_movies` RPC
- `202608040002_service_role_grants.sql`: サーバー限定同期処理のDB権限
- `202608040003_sync_schema_compatibility.sql`: TMDB同期列と配信サービス置換RPC
- `202608040004_search_rpc_permissions.sql`: 非公開ユーザーデータを公開せず検索RPCから安全に参照
- `202608040005_movie_origin_search.sql`: 原語・制作国と邦画・韓国映画の検索語を追加
- `202608040006_search_origin_filter.sql`: 制作国を検索RPCの必須条件として適用
- `202608040007_regional_search_quality.sql`: 地域おすすめ検索の最低投票数条件を追加
- `202608050001_backfill_tmdb_videos.sql`: 同期済みのTMDB予告編を承認済み動画へ移行
- `202608060001_editorial_picks.sql`: 編集部のおすすめ（公開キュレーション）テーブルとRLS
- `202608070001_product_intelligence.sql`: 感情強度、別名、配信履歴、嗜好、計測、フィードバック、問い合わせ、API制限
- `202608070002_provider_history_backfill.sql`: 現在のJP配信情報を履歴へ初期登録
- `202608070003_rls_policy_roles.sql`: 公開読取と管理者ポリシーのrole境界を明示
- `202608070004_provider_check_completion.sql`: 配信先なしを含む最終確認日時を補完

Supabase CLIで適用する前に、必ず対象プロジェクトを確認してください。Freeプラン内で検索を完結させるため、Meilisearchは使用しません。

### 編集部キュレーションを有効にする

1. `supabase link` の対象が正しいことを確認し、`supabase db push` を実行します。`202608060001_editorial_picks.sql` により `editorial_picks` テーブル、RLS、権限が適用されます。
2. 管理に使うアカウントで一度ログインし、`profiles` に自分の行が作成されていることを確認します。
3. Supabase DashboardのTable Editorから、その行の `role` を `admin` に変更します。ブラウザ向けキーや通常ユーザーのAPIからは管理者化できません。
4. `/admin/picks` を開き、映画を検索してコメントと表示順を登録します。表示順は小さい値ほど先頭になり、同じ映画を再登録すると内容が更新されます。
5. 公開中のおすすめがTOP、検索の「編集部のおすすめ」レール、作品詳細に表示されることを確認します。

管理APIも同じ `profiles.role = 'admin'` をサーバー側で確認し、DBのRLSでも書き込みを管理者に限定します。TikTok動画の審査登録は `/admin/videos` と `/api/admin/videos` を使用します。

Googleログイン用にはKIBUN専用Cloudプロジェクト `sunlit-core-504705-g1` とWeb OAuthクライアントを作成済みです。承認済みリダイレクトURIは `https://ovvezqqdkqcqselwulvl.supabase.co/auth/v1/callback`、SupabaseのSite URLは本番URL、Redirect URLsは本番と `http://localhost:3000/auth/callback` に設定済みで、Google Providerも有効化済みです。クライアントシークレットは登録後にローテーションし、旧シークレットを削除しています。メールのマジックリンク認証はGoogleに依存せず、同じアプリ側callbackを利用します。

Google OAuthアプリは現在テスト状態です。一般ユーザーへGoogleログインを公開するには、アカウント所有者がGoogle API Services User Data Policyへ同意し、所有する独自ドメインをOAuth同意画面へ登録して公開状態へ変更します。`workers.dev`のサブドメインはOAuth同意画面のアプリドメインとして保存できないため、独自ドメイン接続後にホーム、プライバシーポリシー、利用規約のURLを登録します。これらはCloudflare Workersへの本番デプロイやメール認証には影響しません。

## TMDB同期

`TMDB_BEARER_TOKEN`、`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` を `.env.local` に設定します。

最初は少量で疎通確認します。

```bash
DOTENV_CONFIG_PATH=.env.local \
SYNC_MAX_PAGES=2 \
SYNC_CONCURRENCY=3 \
npm run sync:movies
```

`SYNC_MAX_PAGES` はTMDBの世界向け `discover`、`popular`、`now_playing` と、日本映画専用 `japan`、韓国映画専用 `korea` の各一覧に対する上限です。指定を外すと処理件数と実行時間が大きくなるため、本番全件同期の前に段階的に増やしてください。`OPENAI_API_KEY` を設定しなければ感情タグ生成を省略し、API費用を発生させずに同期できます。

日本・韓国映画だけを既存データへ追加する場合は、追跡済みの全作品を再取得せずに差分バックフィルできます。

```bash
DOTENV_CONFIG_PATH=.env.local \
SYNC_SOURCES=japan,korea \
SYNC_REFRESH_TRACKED=false \
SYNC_MAX_PAGES=10 \
SYNC_CONCURRENCY=5 \
npm run sync:movies
```

同期は次を行います。

1. TMDBの世界人気作、日本映画、韓国映画の各一覧から対象作品IDを収集
2. 詳細、画像、ジャンル、出演者、監督、日英の動画、JP配信先を取得
3. `tmdb_id` をキーに映画を再実行可能なupsert
4. YouTube予告編を承認済みの `movie_videos` としてupsert
5. 見放題・レンタル・購入の配信状況をスナップショット置換
6. キーワード、別名、概要、レビュー要約から固定ルール・人手override・費用上限付きAIを組み合わせて感情タグと強度を更新
7. 配信開始・終了を履歴化し、`sync_runs` に成功件数と失敗内容を記録

既存の `youtube_video_key` を動画テーブルへ反映し、カバレッジを確認する場合：

```bash
DOTENV_CONFIG_PATH=.env.local npm run backfill:videos
DOTENV_CONFIG_PATH=.env.local npm run backfill:emotions
DOTENV_CONFIG_PATH=.env.local npm run audit:data
```

TMDBに予告編がない作品へ無関係な動画は割り当てません。TOPは動画が確認できた作品だけをフィードへ採用し、全スライドで動画を再生できる状態を保ちます。

## 検索

`/api/search` はSupabaseの `search_movies` RPCを呼び出します。PGroongaの日本語全文検索とpg_trgmの類似度検索を組み合わせ、次の条件を扱います。

- タイトル、原題、概要、ジャンル、感情タグ
- 制作国と原語に基づく「邦画」「日本映画」「韓国映画」「韓流」検索
- 誤字・表記ゆれを含む曖昧検索
- 「疲れたから笑いたい」「怖くない映画を家族で」などの自然文から気分、避けたい要素、上映時間、配信サービスを解釈
- 原文と複数の意味候補を並列検索し、タイトル一致を守りながら感情タグ・ジャンル・概要を優先して再ランキング（評価・人気は補助）
- 検索結果に「この作品を出した理由」とカテゴリ別の横スワイプ表示（Netflix風レール）
- 詳細シートでのYouTube予告編再生（動画なしはポスター静止画）
- 配信サービス、見放題・レンタル・購入
- 上映時間、評価、未視聴
- ページング
- 編集部キュレーション（`editorial_picks`）を検索レールとTOP・詳細に公開表示

Supabase接続またはRPCに失敗した場合だけデモデータへフォールバックします。レスポンスの `source` が `supabase` なら実データ、`demo` ならフォールバックです。

### 検索関連性の正解データ

`scripts/search-evaluation/cases.ts` に「泣ける」「笑える」「癒やされる」「怖くない」の4気分について、各24作品（正解12・不正解12）の固定判定をTMDB ID付きで管理します。件数、ラベルの均衡、ID重複はunit testで検証します。

同期済みDBに全作品が存在し、保存したタイトルと一致することは次のコマンドで確認できます。

```bash
DOTENV_CONFIG_PATH=.env.local npm run validate:search-relevance
```

作品の追加・再判定時は検索結果だけを根拠にせず、各ケースの `relevanceCriteria` に沿ってラベルを更新してください。Precision@10回帰とDB検索速度は次で確認できます。

```bash
DOTENV_CONFIG_PATH=.env.local npm run test:search-quality
DOTENV_CONFIG_PATH=.env.local npm run bench:search
```

2026-08-06時点で「泣ける」「笑える」「癒やされる」「怖くない」はすべてPrecision@10 = 1.0です。自然文展開は最大6候補、DBへの同時RPCは2件に制限し、Supabase Freeへの突発負荷を抑えます。

## Cloudflare Workersへ公開

Next.js 16を公式推奨の `@opennextjs/cloudflare` アダプターでWorkersへ変換します。

```bash
npx wrangler login
npm run cf:preview
npm run cf:deploy
```

初回公開前に、Cloudflare DashboardのWorkers設定またはWranglerで環境変数を登録してください。

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` は `wrangler.jsonc` の `vars` で管理します。Dashboardで追加したVariablesを維持するため、デプロイでは `--keep-vars` を付けます。独自ドメインは公開後にCloudflare DashboardのWorker Routes & Domainsから追加できます。

Cloudflare Workers Buildsを使う場合：

- Build command: `npm run cf:build`
- Deploy command: `npx opennextjs-cloudflare deploy -- --keep-vars`
- Node.js: 22

GitHub Actionsでは `.github/workflows/deploy.yml` の `Deploy production` が `main` へのpushと手動実行で起動し、format、lint、typecheck、unit testの通過後に本番へデプロイします。リポジトリは [yushihonda/kibun](https://github.com/yushihonda/kibun) で管理し、次のSecretsを登録済みです。

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

月次同期に必要な `SUPABASE_SERVICE_ROLE_KEY` と `TMDB_BEARER_TOKEN`、任意の `OPENAI_API_KEY` も同じGitHub Secretsで管理します。Cloudflare Workerに登録済みの `SUPABASE_SERVICE_ROLE_KEY` はデプロイ時に維持されます。詳細は `docs/operations.md` を参照してください。

## 品質確認

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
DOTENV_CONFIG_PATH=.env.local npm run test:search-quality
DOTENV_CONFIG_PATH=.env.local npm run audit:data
DOTENV_CONFIG_PATH=.env.local npm run verify:production
npm audit
```

`npm run test:e2e` は `.env.local` のSupabase設定を読み込みます。サービスロールが設定されている場合はプロジェクト別の専用テストアドレスへ管理APIでマジックリンクを発行し、ログイン、初期設定、お気に入り3件、理由付き未視聴推薦、未ログイン操作の復元、別ブラウザコンテキストへの同期、デスクトップ・モバイル表示を確認します。受信箱や固定パスワードは使用しません。

## 実装完了状況

第1波に加えて、READMEで計画していた第2波以降も実装済みです。チェックはコード・migration・自動テスト・本番DB監査で確認した項目を示します。

### 1. 「泣ける」などの気分検索を評価可能にする

自然文・短語の解釈、感情タグ優先の再ランキング、理由表示、主要4気分の正解・不正解データに加え、継続測定まで実装済みです。

- [x] TMDBのジャンルだけに依存せず、概要・レビュー要約・キーワードから感情タグと強度を付ける
- [x] 感情タグの付与方法を、人手の固定タグ、ルール、費用上限付きAI生成の組み合わせで決める
- [x] 「合っている／違う」のフィードバックを保存し、ゼロ件率、クリック率、保存率と一緒に評価する
- [x] 正解データに対するPrecision@10を自動テストし、ランキング変更による悪化を検出する

完了条件: 「泣ける」の上位10件を人手評価し、少なくとも8件が意図に合い、変更前後の精度を自動比較できること。

### 2. ログインユーザー向けの関連作品・おすすめ

お気に入りだけでなく、見たい・見た・評価・検索・作品詳細の閲覧を推薦シグナルとして利用します。履歴が少ないユーザーには全体の人気作を返し、行動が増えるほど個人向けへ寄せます。編集部キュレーション（`/admin/picks`）は一般ユーザーのお気に入りとは別に公開表示済みです。

- [x] お気に入り、見たい、見た、高評価を重み付きの嗜好プロフィールへ集約する
- [x] 好きな作品のジャンル、感情タグ、制作国、監督、出演者から関連作品を算出する
- [x] 作品詳細に「この作品が好きなら」を追加する
- [x] TOPに「あなたへのおすすめ」「お気に入りに似た作品」「まだ見ていない作品」を追加する
- [x] 視聴済み作品を除外し、同じシリーズ・ジャンルだけに偏らないよう候補を多様化する
- [x] 新規ユーザー向けに好きな気分・ジャンル・作品を選ぶ初期設定を用意する
- [x] 推薦理由を表示し、ユーザーが履歴の削除やパーソナライズ停止を選べるようにする

完了条件: お気に入りを3件以上登録したユーザーに、その内容を反映した未視聴作品と推薦理由を返せること。

### 3. TOPを固定表示から動的フィードへ変更

全員に同じ固定作品を見せるのではなく、公開日、国内配信状況、話題性、ユーザーの嗜好を組み合わせてセクションを構成します。検索UIのカテゴリ横レールは先に実装済みなので、TOP側のセクションAPI化で再利用します。

- [x] 「劇場公開中・近日公開」「最近追加」「配信中」「話題」「高評価」の取得条件を定義する
- [x] TMDBの公開日とJP配信情報を定期更新し、古い配信状況には確認日時を表示する
- [x] 未ログイン時は最新・配信中・話題を中心にし、ログイン時は個人向けセクションを優先する
- [x] ユーザー行動と配信状況による差し替えを実装する
- [x] 同じ作品の重複表示を避け、表示順をAPI側で再現可能にする
- [x] セクションごとの表示、クリック、保存、再生開始を計測して並び順を改善する

完了条件: TOPの各セクションがDBから動的に生成され、ログイン状態と嗜好によって内容が変わり、固定デモ配列へ依存しないこと。

検索正解データとプロダクトイベントは、検索・推薦・TOPに共通の品質指標として継続利用します。

## 本番公開に向けたロードマップ

### Phase 1: データ基盤を本番量へ拡張

- [x] TMDB同期結果、重複、欠損画像、配信終了の検証レポートを追加（`.artifacts/data-audit.json`）

完了条件: 主要な日本公開作品を検索でき、同期を再実行しても重複せず、部分失敗を追跡できること。

### Phase 2: フィードと検索品質

- [x] `youtube_video_key` を本番フィードで利用し、承認済みTikTok動画と統合
- [x] 人名・固有名詞の読み仮名と、英題・邦題の別名辞書を追加
- [x] 感情タグ強度とPrecision@10の評価を追加
- [x] OpenAIなしの固定感情タグ運用と費用上限付き生成を組み合わせる
- [x] ランキングを「新着」「話題」「高評価」「保存数」で分離
- [x] TOPを「公開中」「配信中」「話題」「高評価」の動的セクションへ切替

完了条件: デモデータに依存せず、検索結果から実作品フィードへ遷移できること。

### Phase 3: ユーザー機能

- [x] Google Web OAuthクライアントを作成し、Supabase Google Provider、Site URL、Redirect URLsを本番設定（本番からGoogleアカウント選択画面まで確認済み）
- [ ] Googleログインを一般公開する場合、Google API Services User Data Policyへ所有者が同意し、独自ドメイン登録後にOAuthアプリを公開状態へ変更
- [ ] iOS Safari・Android Chromeの実機で、メールリンクとGoogleログインのcallback完了、ログイン後データ同期を確認（PC・モバイルエミュレーションE2Eは完了）
- [x] ユーザー行動から嗜好プロフィールと関連作品を生成
- [x] 「あなたへのおすすめ」と推薦理由、パーソナライズ停止設定を追加
- [x] 未ログイン操作をログイン後に復元
- [x] マイページと共有画像を実データへ切替
- [x] アカウント削除とデータ削除依頼を実装

完了条件: RLSを維持したまま、複数端末でユーザーデータが同期されること。

### Phase 4: 月次自動更新と運用

- [x] GitHubリポジトリを作成し、コードとmigrationを管理
- [x] GitHub Actionsで毎月1日03:00 UTCの同期workflowを追加
- [x] GitHub SecretsへTMDB・Supabaseのサーバー限定キーを登録
- [x] 手動再実行、タイムアウト、最大3回リトライ、失敗Issue通知を追加
- [x] CloudflareとSupabaseのエラー、検索ゼロ件率、同期件数を監視
- [x] DBバックアップと復旧手順を文書化（`docs/operations.md`）

完了条件: 秘密情報をリポジトリへ置かず、月次同期が自動実行され、失敗時に原因を確認して再実行できること。

### Phase 5: 公開前チェック

- [ ] 所有する独自ドメインを接続（ドメイン指定待ち。`workers.dev`では本番公開済み）
- [x] OGP、sitemap、robots、canonical、構造化データ、Web App Manifest
- [x] nonce付きCSP、管理画面権限、RLS、APIレート制限の再監査
- [x] モバイル・デスクトップE2E、アクセシビリティ、Reduced Motion
- [x] LCP・CLS・動画遅延ロード・画像404の改善
- [x] TMDBロゴと指定文言、JustWatch、YouTube、TikTokの帰属確認
- [x] プライバシーポリシー、利用規約、問い合わせ・削除窓口の確定

完了条件: 主要導線のE2E、権限監査、帰属、性能、障害時の代替表示を満たすこと。

## クレジットと利用条件

本サービスは非商用利用を前提としています。TMDB指定のクレジットと、配信情報を表示する作品ごとのJustWatch帰属が必要です。収益化する場合は、公開前にTMDBとの商用契約を確認してください。
