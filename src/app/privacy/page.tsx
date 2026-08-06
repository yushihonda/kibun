import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー">
      <p>
        KIBUNは、ログイン時の識別情報、保存した映画、評価、レビュー、および同意を得た検索利用情報を、サービス提供と検索品質改善のために取り扱います。
      </p>
      <section>
        <h2 className="font-bold text-white">保存する情報</h2>
        <p>
          メールアドレスまたはOAuth識別子、表示名、視聴状態、お気に入り、個人評価、レビュー、匿名化した検索語とクリック情報を保存する場合があります。
        </p>
      </section>
      <section>
        <h2 className="font-bold text-white">第三者サービス</h2>
        <p>
          Supabase、Cloudflare
          Workers、TMDB、JustWatch、YouTube、TikTok、および明示した費用上限内のタグ生成サービスを利用します。各サービスにはそれぞれの規約が適用されます。
        </p>
      </section>
      <section>
        <h2 className="font-bold text-white">削除依頼</h2>
        <p>
          マイページからアカウントと関連データを即時削除できます。ログインできない場合や掲載内容に関する削除は、問い合わせ・削除窓口から依頼できます。
        </p>
        <a href="/support" className="text-lime-300 underline">
          問い合わせ・削除窓口
        </a>
      </section>
      <section>
        <h2 className="font-bold text-white">選択と管理</h2>
        <p>
          マイページでパーソナライズを停止し、検索・閲覧・推薦フィードバック履歴を削除できます。停止後は全体の人気・評価・配信状況をもとに表示します。
        </p>
      </section>
      <p className="text-xs">制定・最終更新: 2026年8月6日</p>
    </LegalPage>
  );
}
