import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KIBUN — 気分で見つかる、次の一本。",
    short_name: "KIBUN",
    description:
      "気分・空き時間・配信サービスから映画を見つける映画DB型メディア",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#bef264",
    lang: "ja",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
