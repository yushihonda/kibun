import { z } from "zod";

const allowedHosts = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

const oEmbedSchema = z.object({
  title: z.string().default(""),
  author_name: z.string().default(""),
  author_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  embed_product_id: z.string().optional(),
});

export function validateTikTokUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("有効なURLを入力してください");
  }

  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error("TikTokのHTTPS URLのみ登録できます");
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function inspectTikTokVideo(input: string) {
  const url = validateTikTokUrl(input);
  const response = await fetch(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(8_000), cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("TikTok動画を確認できませんでした");
  }

  const result = oEmbedSchema.parse(await response.json());
  const pathVideoId = new URL(url).pathname.match(/\/video\/(\d+)/)?.[1];
  const videoId = result.embed_product_id ?? pathVideoId;
  if (!videoId) throw new Error("動画IDを確認できませんでした");

  return {
    platform: "tiktok" as const,
    videoId,
    url,
    title: result.title,
    authorName: result.author_name,
    thumbnailUrl: result.thumbnail_url ?? null,
  };
}
