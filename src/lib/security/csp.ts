export function createContentSecurityPolicy(
  nonce: string,
  development: boolean,
) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""} https:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://image.tmdb.org https://*.tiktokcdn.com https://*.ytimg.com",
    "font-src 'self' data:",
    "media-src 'self' blob: https://*.googlevideo.com",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com",
    "connect-src 'self' https://*.supabase.co https://api.themoviedb.org https://www.googleapis.com https://api.openai.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
