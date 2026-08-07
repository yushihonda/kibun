"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ResilientImage as Image } from "@/components/resilient-image";

type SearchResult = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string;
  posterUrl: string;
};

export function TitleImportForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/titles?q=${encodeURIComponent(query.trim())}`,
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { results?: SearchResult[] };
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const importTitle = async (result: SearchResult) => {
    const key = `${result.mediaType}:${result.tmdbId}`;
    setImporting(key);
    setMessages((current) => ({ ...current, [key]: "" }));
    try {
      const response = await fetch("/api/admin/titles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mediaType: result.mediaType,
          tmdbId: result.tmdbId,
        }),
      });
      if (!response.ok) throw new Error();
      setMessages((current) => ({
        ...current,
        [key]: "追加しました。再追加した場合は最新情報に更新されます。",
      }));
    } catch {
      setMessages((current) => ({
        ...current,
        [key]:
          "追加できませんでした。DB migrationと環境変数を確認してください。",
      }));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <label className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4">
          <Search size={18} className="text-white/45" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="映画・ドラマのタイトルを検索"
          />
        </label>
        <button
          disabled={searching || query.trim().length < 2}
          className="rounded-2xl bg-lime-300 px-5 text-sm font-black text-zinc-950 disabled:opacity-40"
        >
          {searching ? <LoaderCircle className="animate-spin" /> : "検索"}
        </button>
      </form>

      <div className="mt-6 grid gap-3">
        {results.map((result) => {
          const key = `${result.mediaType}:${result.tmdbId}`;
          return (
            <article
              key={key}
              className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-3"
            >
              <div className="relative h-28 w-[74px] shrink-0 overflow-hidden rounded-xl bg-white/5">
                <Image
                  src={result.posterUrl}
                  alt=""
                  fill
                  sizes="74px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black tracking-widest text-lime-300">
                  {result.mediaType === "tv" ? "ドラマ" : "映画"} ・ TMDB{" "}
                  {result.tmdbId}
                </p>
                <h2 className="mt-1 font-black">{result.title}</h2>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">
                  {result.overview || "あらすじは未登録です。"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={Boolean(importing)}
                    onClick={() => importTitle(result)}
                    className="rounded-full border border-lime-300/40 px-4 py-2 text-xs font-black text-lime-300 disabled:opacity-40"
                  >
                    {importing === key ? "追加中…" : "KIBUNに追加"}
                  </button>
                  {messages[key] && (
                    <p className="text-xs text-white/60">{messages[key]}</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!searching && query && results.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">
            検索結果がありません。
          </p>
        )}
      </div>
    </div>
  );
}
