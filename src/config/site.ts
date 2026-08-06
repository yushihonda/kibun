export const siteConfig = {
  name: "KIBUN",
  tagline: "気分で見つかる、次の一本。",
  description:
    "気分・空き時間・使っている配信サービスから、次に観たい映画を見つける映画データベース。",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "ja_JP",
} as const;
