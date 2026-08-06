import { createClient } from "@supabase/supabase-js";
import { demoMovies } from "@/data/demo-movies";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type ShareMovie = {
  id: string;
  title: string;
  emotional_tags: string[] | null;
};

function escapeXml(value: string) {
  return value.replace(/[<>&"']/gu, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

async function loadMovies(ids: string[]): Promise<ShareMovie[]> {
  const config = getSupabasePublicConfig();
  if (!config) {
    return demoMovies.slice(0, 9).map((movie) => ({
      id: movie.id,
      title: movie.title,
      emotional_tags: movie.emotionalTags,
    }));
  }
  const supabase = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = supabase
    .from("movies")
    .select("id,title,emotional_tags")
    .eq("adult", false)
    .limit(9);
  query = ids.length
    ? query.in("id", ids)
    : query.order("popularity", { ascending: false });
  const { data, error } = await query;
  if (error) return [];
  const movies = (data ?? []) as ShareMovie[];
  const byId = new Map(movies.map((movie) => [movie.id, movie]));
  return ids.length
    ? ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    : movies;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const heading = searchParams.get("title")?.slice(0, 40) || "お気に入り映画";
  const selectedIds = (searchParams.get("movies")?.split(",") ?? [])
    .filter((id) => /^[0-9a-f-]{36}$/iu.test(id))
    .slice(0, 9);
  const selected = await loadMovies(selectedIds);
  const cards = selected
    .map((movie, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 52 + column * 382;
      const y = 225 + row * 152;
      const title = escapeXml(movie.title.slice(0, 18));
      const tag = escapeXml(movie.emotional_tags?.[0] ?? "おすすめ");
      return `<g transform="translate(${x} ${y})">
        <rect width="350" height="120" rx="18" fill="${index % 2 ? "#18181b" : "#27272a"}" stroke="#3f3f46"/>
        <text x="20" y="36" fill="#bef264" font-size="18">#${tag}</text>
        <text x="20" y="84" fill="#ffffff" font-size="25" font-weight="800">${title}</text>
      </g>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <rect width="1200" height="1200" fill="#0a0a0a"/>
    <g font-family="system-ui, sans-serif">
      <text x="52" y="76" fill="#ffffff" font-size="32" font-weight="900" letter-spacing="8">KIBUN</text>
      <text x="1148" y="76" fill="#bef264" font-size="20" text-anchor="end">気分で見つかる、次の一本。</text>
      <text x="52" y="165" fill="#ffffff" font-size="54" font-weight="900">${escapeXml(heading)}</text>
      ${cards}
      <text x="52" y="1148" fill="#a1a1aa" font-size="16">kibun.kibun-jp.workers.dev</text>
      <text x="1148" y="1148" fill="#a1a1aa" font-size="16" text-anchor="end">Movie data: TMDB</text>
    </g>
  </svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
