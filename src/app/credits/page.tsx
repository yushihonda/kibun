import { LegalPage } from "@/components/legal-page";
import Image from "next/image";

export default function CreditsPage() {
  return (
    <LegalPage title="クレジット">
      <section>
        <h2 className="font-bold text-white">The Movie Database (TMDB)</h2>
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block"
        >
          <Image
            src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg"
            alt="TMDB"
            width={88}
            height={64}
            className="h-14 w-auto"
          />
        </a>
        <p className="mt-2">
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
        <p>
          本サービスの映画情報・画像の一部にはTMDB
          APIを利用しています。TMDBによる承認または認定を受けたサービスではありません。
        </p>
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noreferrer"
          className="text-lime-300 underline"
        >
          The Movie Database
        </a>
      </section>
      <section>
        <h2 className="font-bold text-white">JustWatch</h2>
        <p className="mt-2">
          映画の配信状況はTMDBとJustWatchから提供されています。配信情報は変更される場合があるため、視聴前に各サービスで最新情報をご確認ください。
        </p>
      </section>
      <section>
        <h2 className="font-bold text-white">YouTube / TikTok</h2>
        <p className="mt-2">
          予告編およびショート動画は各プラットフォームの公式埋め込み機能を利用しています。動画の権利は各権利者に帰属します。
        </p>
        <p>
          プレーヤー内のロゴ、投稿者名、リンク、標準操作を隠したり変更したりせず、各プラットフォームが提供する状態で表示します。
        </p>
        <div className="flex gap-4">
          <a
            href="https://www.youtube.com/"
            target="_blank"
            rel="noreferrer"
            className="text-lime-300 underline"
          >
            YouTube
          </a>
          <a
            href="https://www.tiktok.com/"
            target="_blank"
            rel="noreferrer"
            className="text-lime-300 underline"
          >
            TikTok
          </a>
        </div>
      </section>
      <p className="text-xs">最終確認日: 2026年8月6日</p>
    </LegalPage>
  );
}
