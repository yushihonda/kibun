import sharp from "sharp";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#09090b"/>
      <stop offset="0.65" stop-color="#27272a"/>
      <stop offset="1" stop-color="#365314"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#background)"/>
  <circle cx="1070" cy="80" r="250" fill="#84cc16" opacity="0.08"/>
  <text x="72" y="100" fill="#bef264" font-family="Noto Sans CJK JP, sans-serif" font-size="28" font-weight="800" letter-spacing="12">KIBUN</text>
  <text x="72" y="330" fill="#ffffff" font-family="Noto Sans CJK JP, sans-serif" font-size="76" font-weight="900">気分で見つかる、</text>
  <text x="72" y="435" fill="#ffffff" font-family="Noto Sans CJK JP, sans-serif" font-size="96" font-weight="900">次の一本。</text>
  <text x="72" y="525" fill="#d4d4d8" font-family="Noto Sans CJK JP, sans-serif" font-size="26">気分・空き時間・配信サービスから映画を検索</text>
</svg>`;

async function main() {
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile("public/og-image.png");
}

void main();
