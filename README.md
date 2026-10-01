# KIBUN

気分・空き時間・配信サービスから、次に観たい映画を見つける映画DB型メディアです。

## 現在の公開状況

- 本番URL: https://kibun.kibun-jp.workers.dev
- Web: Next.js 16 + Cloudflare Workers（OpenNext）
- DB / Auth: Supabase Free
- 検索: Supabase PostgreSQL + PGroonga + pg_trgm
- 映画・ドラマデータ: TMDB APIから12,417件を同期済み（映画10,761件、ドラマ1,656件、邦画2,624件、うち直近2年1,197件、承認済み動画あり9,250件、2026-10-01監査）
- 本番の `/api/search` がデモではなくSupabase実データを返すことを確認済み
- TOPフィード: 承認済みYouTube予告編がある実作品だけを表示
- Googleログイン: OAuthアプリを本番公開済み（全Googleユーザー向け、データアクセス検証不要）
- Meilisearchは使用せず、初期運用を無料枠で完結

アプリ実装、DB migration、本番データ補完、権限監査、Googleログイン公開、PC・モバイルE2E、GitHub管理とActions本番デプロイまで完了しています。残作業は、所有する独自ドメインの接続だけです。

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

Google OAuthアプリは公開ステータスを「本番環境」へ変更済みで、テストユーザー限定ではありません。機密性の高いスコープや制限付きスコープは要求しておらず、Google Auth Platformの検証センターでもデータアクセスの検証は不要と確認済みです。ブランディングは、所有する独自ドメインを接続してからホーム、プライバシーポリシー、利用規約のURLを登録します。`workers.dev`のサブドメインはOAuth同意画面のアプリドメインとして保存できません。これらはCloudflare Workersへの本番デプロイやメール認証には影響しません。

## TMDB同期

`TMDB_BEARER_TOKEN`、`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` を `.env.local` に設定します。

最初は少量で疎通確認します。

```bash
DOTENV_CONFIG_PATH=.env.local \
SYNC_MAX_PAGES=2 \
SYNC_CONCURRENCY=3 \
npm run sync:movies
```

`SYNC_MAX_PAGES` はTMDBの世界向け `discover`、`popular`、`trending`、映画の上映中・ドラマの本日放送を扱う `now_playing`、映画の近日公開・ドラマの放送中を扱う `upcoming` と、日本作品専用 `japan`、韓国作品専用 `korea` の各一覧に対する上限です。指定を外すと処理件数と実行時間が大きくなるため、本番全件同期の前に段階的に増やしてください。`OPENAI_API_KEY` を設定しなければ感情タグ生成を省略し、API費用を発生させずに同期できます。

GitHub Actionsの `Daily movie and drama trends` は、週間トレンドを各3ページ、上映中・本日放送・近日公開・放送中を各5ページ、さらに直近3暦年の邦画を5ページ、毎日無料のTMDB APIから同期します。一覧取得後に削除されたTMDB作品の404は安全にスキップし、一時的な通信エラーだけを最大3回再試行します。

`Japanese movie catalog sync` は毎月15日に、当年を含む直近4暦年の日本制作映画を100ページ（最大約2,000候補）同期します。同期後は、それより古い邦画のうち「評価7.0以上かつ投票100件以上」または「評価6.5以上かつ投票150件以上」の名作条件を満たさない作品を削除します。名作と、お気に入り・レビュー・編集部選定・手動補正がある作品は保護します。AI感情タグ生成は無効にし、既存のTMDB・Supabase構成だけで邦画カタログを維持します。

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

`/api/search` は、認識済みの気分検索ではGINインデックス済みの感情タグ・ジャンルから候補を直接取得し、タイトル・配信先・TikTok話題検索などではSupabaseの `search_movies` RPCを呼び出します。PGroongaの日本語全文検索とpg_trgmの類似度検索も組み合わせ、次の条件を扱います。

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

2026-08-06時点で「泣ける」「笑える」「癒やされる」「怖くない」はすべてPrecision@10 = 1.0です。自然文の認識済み気分は高速なタグ候補検索を使い、それ以外の検索展開は上位3候補までを並列実行して待ち時間とSupabase負荷を抑えます。検索イベントの保存はレスポンス送信後に行います。

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

## 残作業

- 独自ドメインを取得し、Cloudflare Worker、Supabase、Google OAuth、公開URL設定へ接続する

## クレジットと利用条件

本サービスは非商用利用を前提としています。TMDB指定のクレジットと、配信情報を表示する作品ごとのJustWatch帰属が必要です。収益化する場合は、公開前にTMDBとの商用契約を確認してください。
