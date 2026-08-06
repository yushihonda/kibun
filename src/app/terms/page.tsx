import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return (
    <LegalPage title="利用規約">
      <p>
        KIBUNは非商用の映画発見サービスです。表示される配信状況、評価、あらすじ、AI生成タグの完全性・正確性・最新性を保証するものではありません。
      </p>
      <section>
        <h2 className="font-bold text-white">禁止事項</h2>
        <p>
          不正アクセス、過度な自動取得、第三者の権利を侵害する投稿、嫌がらせ、虚偽レビュー、サービス運営を妨げる行為を禁止します。
        </p>
      </section>
      <section>
        <h2 className="font-bold text-white">問い合わせ</h2>
        <p>
          規約、掲載内容、権利に関する連絡は問い合わせ窓口から受け付けます。
        </p>
        <a href="/support" className="text-lime-300 underline">
          問い合わせ窓口
        </a>
      </section>
      <p className="text-xs">制定・最終更新: 2026年8月6日</p>
      <section>
        <h2 className="font-bold text-white">投稿コンテンツ</h2>
        <p>
          投稿者はレビューに必要な権利を保持するものとします。不適切な投稿は予告なく非公開または削除する場合があります。
        </p>
      </section>
      <section>
        <h2 className="font-bold text-white">外部サービス</h2>
        <p>
          配信先や動画サイトへの移動後は、各外部サービスの規約が適用されます。KIBUNは外部サービス上の購入・再生について責任を負いません。
        </p>
      </section>
    </LegalPage>
  );
}
