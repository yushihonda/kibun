# KIBUN 運用・復旧手順

## 月次同期

GitHub Actionsの `Monthly movie sync` は毎月1日03:00 UTCに実行する。手動実行では `max_pages` と `sources` を変更できる。同期は再実行可能なupsertで、最大3回まで待機時間を増やして再試行する。失敗時は `sync-failure` Issueを作成し、データ監査JSONをartifactへ保存する。

必須のGitHub Secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（認証E2E用）
- `SUPABASE_SERVICE_ROLE_KEY`
- `TMDB_BEARER_TOKEN`
- `OPENAI_API_KEY`（任意。上限が0なら利用しない）

AIタグ生成はRepository Variablesの `EMOTION_AI_MAX_MOVIES` と `EMOTION_AI_MAX_COST_USD` の両方が正のときだけ実行する。

## TikTok話題同期

GitHub Actionsの `TikTok movie and drama trends` は毎月1日から29日まで2日おきの02:50 UTCに実行する。映画とドラマを明示的に分けた上位20候補をローテーションし、RapidAPIの `tiktok-api23` にある `Discover Posts by Keyword` から1回1作品・最大30投稿の公開メタデータを取得する。無料Basic枠（月100リクエスト）では1作品につき最大6ページ、月最大90リクエストに抑える。反応率・話題度・共起ハッシュタグ・関心テーマ・感情傾向を作品別に更新し、動画ファイルと個々のコメント本文は保存しない。

追加のGitHub Secrets:

- `RAPIDAPI_TIKTOK_KEY`（必須。未設定時は同期を安全にスキップ）
- `OPENAI_API_KEY`（任意。未設定時は決定的な簡易感情判定へフォールバック）

手動確認はActionsの `Run workflow` で `title_limit=1` のまま実行するか、ローカルで `npm run sync:tiktok` を実行し、`sync_runs.source = 'tiktok_social'`、`movie_social_posts`、`movie_social_signals` の件数と `/admin/operations` を確認する。APIプランを上げた場合だけ `TIKTOK_SYNC_TITLE_LIMIT`、`TIKTOK_SYNC_POSTS_PER_TITLE`、`TIKTOK_AI_MAX_TITLES` を増やす。

## 本番デプロイ

GitHub Actionsの `Deploy production` は `main` へのpushと手動実行で起動する。format、lint、typecheck、unit testがすべて通過した後だけ、OpenNextでビルドしてCloudflare Workersの `kibun` へデプロイする。同時デプロイは行わず、先に開始した実行を完了させる。

追加で必要なGitHub Secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`（対象アカウントのWorkers Scriptsを編集できる最小権限）

`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` はCIとデプロイで共用する。`SUPABASE_SERVICE_ROLE_KEY` はGitHub Actionsの月次同期には必要だが、WebデプロイではCloudflare Workerに登録済みのSecretを `--keep-vars` で維持し、ビルドジョブへは渡さない。

初回はGitHubのActions画面から `Deploy production` を手動実行し、完了後に次を確認する。

```bash
curl --fail --silent --show-error https://kibun.kibun-jp.workers.dev/api/health
```

失敗時は同じcommitを再実行する。アプリ障害が発生した場合はCloudflare DashboardのWorkers & Pages > `kibun` > Deploymentsから直前の正常版へロールバックする。

## 監視

- 公開ヘルスチェック: `GET /api/health`
- 管理ダッシュボード: `/admin/operations`
- Cloudflare: Workers & Pages > `kibun` > Observabilityで5xx、CPU時間、例外を確認
- Supabase: Logs ExplorerでPostgres/Auth/APIエラーを確認
- アプリ指標: 検索ゼロ件率、作品クリック、保存、再生開始、推薦フィードバック一致率
- データ指標: `npm run audit:data` の件数、画像欠損、動画カバレッジ、配信確認の期限切れ、同期失敗

5xxまたはゼロ件率が通常値から急増した場合は、直近Worker VersionへCloudflare Dashboardからロールバックし、Supabaseのmigration状態と `sync_runs` を確認する。

## バックアップ

Supabase Dashboardの自動バックアップが利用できるプランでは保持設定を確認する。Freeプランでは月次同期前とschema変更前にCLIで論理バックアップを取得する。

```bash
mkdir -p .artifacts/backups
supabase db dump --linked --file .artifacts/backups/schema.sql
supabase db dump --linked --data-only --use-copy --file .artifacts/backups/data.sql
```

バックアップには個人情報と秘密情報が含まれ得るため、公開リポジトリへ追加しない。暗号化した非公開ストレージへ移し、復旧演習後に不要なローカルコピーを削除する。

## 復旧

1. 誤操作中の同期・デプロイを停止する。
2. 新しいSupabaseプロジェクトまたは隔離DBへ `schema.sql`、次に `data.sql` を復元する。
3. migrationを適用し、`npm run audit:data` と `npm run test:search-quality` を実行する。
4. 認証、RLS、管理APIをステージングURLで確認する。
5. CloudflareのSupabase変数／Secretを復旧先へ切り替え、ヘルスチェック後にトラフィックを戻す。

```bash
psql "$RECOVERY_DATABASE_URL" -v ON_ERROR_STOP=1 -f .artifacts/backups/schema.sql
psql "$RECOVERY_DATABASE_URL" -v ON_ERROR_STOP=1 -f .artifacts/backups/data.sql
```

## 独自ドメイン

取得済みドメインをCloudflare Workers > Settings > Domains & Routesへ追加し、`NEXT_PUBLIC_SITE_URL`、Supabase Site URL、Redirect URLs、sitemap、canonicalの順に更新する。DNSと証明書がActiveになるまでは `workers.dev` URLを本番URLとして維持する。

## 公開前の手動確認

- お気に入り3件から理由付き未視聴推薦が出ることを確認
- アカウント削除後に再ログインして映画棚が空であることを確認
- YouTube/TikTokのロゴ、標準操作、投稿者へのリンクが隠れていないことを確認
- TMDBとJustWatchの帰属、利用規約、プライバシー、問い合わせ窓口を確認
