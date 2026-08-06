import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SupportForm } from "@/features/support/support-form";

export const metadata: Metadata = { title: "お問い合わせ・削除窓口" };

export default function SupportPage() {
  return (
    <LegalPage title="お問い合わせ・削除窓口">
      <p>
        掲載内容、権利、プライバシー、データ削除についてはこちらから連絡できます。ログイン中の方はマイページからアカウントを即時削除できます。
      </p>
      <SupportForm />
    </LegalPage>
  );
}
