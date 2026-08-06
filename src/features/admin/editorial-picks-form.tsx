"use client";

import { CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

type PickItem = {
  id: string;
  movie_id: string;
  comment: string;
  is_featured: boolean;
  sort_order: number;
  movies?: { title?: string; poster_path?: string | null } | null;
};

type SearchHit = {
  id: string;
  title: string;
};

async function fetchPicks(): Promise<PickItem[]> {
  const response = await fetch("/api/admin/editorial-picks");
  const data = (await response.json()) as {
    picks?: PickItem[];
    error?: string;
    loginUrl?: string;
  };
  if (response.status === 401 && data.loginUrl) {
    window.location.href = data.loginUrl;
    return [];
  }
  if (!response.ok) throw new Error(data.error || "読み込みに失敗しました");
  return data.picks ?? [];
}

export function EditorialPicksForm() {
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selectedMovieId, setSelectedMovieId] = useState("");
  const [comment, setComment] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPicks()
      .then((next) => {
        if (!cancelled) setPicks(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "読み込みに失敗しました",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=8`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { hits?: SearchHit[] };
        setHits(data.hits ?? []);
      } catch {
        // ignore abort
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function reloadPicks() {
    setLoading(true);
    try {
      setPicks(await fetchPicks());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "読み込みに失敗しました",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMovieId) {
      setError("映画を選んでください");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/editorial-picks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          movieId: selectedMovieId,
          comment,
          isFeatured: true,
          sortOrder,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        loginUrl?: string;
      };
      if (response.status === 401 && data.loginUrl) {
        window.location.href = data.loginUrl;
        return;
      }
      if (!response.ok) throw new Error(data.error || "保存に失敗しました");
      setMessage("編集部おすすめを保存しました");
      setComment("");
      setSelectedMovieId("");
      setQuery("");
      setHits([]);
      await reloadPicks();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function removePick(movieId: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/editorial-picks", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ movieId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "削除に失敗しました");
      await reloadPicks();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "削除に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <form
        onSubmit={submit}
        className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6"
      >
        <div>
          <h2 className="font-black">編集部のおすすめを登録</h2>
          <p className="mt-1 text-xs text-white/45">
            一般ユーザーのお気に入りとは別に、公開コメント付きで掲載します
          </p>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-white/60">映画を検索</span>
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (!value.trim()) setHits([]);
            }}
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-lime-300"
            placeholder="タイトルや気分で検索"
          />
        </label>
        {hits.length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-2">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMovieId(hit.id);
                    setQuery(hit.title);
                    setHits([]);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 ${
                    selectedMovieId === hit.id
                      ? "bg-lime-300/20 text-lime-200"
                      : ""
                  }`}
                >
                  {hit.title}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="block">
          <span className="text-xs font-bold text-white/60">
            編集部コメント
          </span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            rows={4}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-lime-300"
            placeholder="なぜ今これに刺さるのかを書いてください"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-white/60">
            表示順（小さいほど上）
          </span>
          <input
            type="number"
            min={0}
            max={9999}
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-lime-300"
          />
        </label>
        <button
          type="submit"
          disabled={saving || !selectedMovieId}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-300 font-black text-zinc-950 disabled:opacity-50"
        >
          {saving && <LoaderCircle className="animate-spin" size={18} />}
          おすすめに追加
        </button>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200"
          >
            {error}
          </p>
        )}
        {message && (
          <div className="flex gap-3 rounded-xl bg-lime-300/10 p-4 text-sm text-lime-200">
            <CheckCircle2 className="shrink-0" size={19} />
            <p>{message}</p>
          </div>
        )}
      </form>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black">登録済みのおすすめ</h2>
          {loading && (
            <LoaderCircle className="animate-spin text-white/40" size={18} />
          )}
        </div>
        <ul className="mt-4 space-y-3">
          {picks.map((pick) => (
            <li
              key={pick.id}
              className="flex items-start justify-between gap-3 rounded-2xl bg-black/25 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {pick.movies?.title ?? pick.movie_id}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  順 {pick.sort_order}
                  {pick.is_featured ? " · 公開中" : " · 非公開"}
                </p>
                {pick.comment && (
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    {pick.comment}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void removePick(pick.movie_id)}
                className="rounded-full bg-white/10 p-2 hover:bg-rose-500/30"
                aria-label="削除"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {!loading && picks.length === 0 && (
            <li className="text-sm text-white/45">まだ登録がありません</li>
          )}
        </ul>
      </section>
    </div>
  );
}
