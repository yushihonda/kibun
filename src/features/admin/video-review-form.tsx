"use client";

import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";

type Result = {
  videoId: string;
  title: string;
  authorName: string;
  status: string;
};

export function VideoReviewForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          movieId: form.get("movieId"),
          url: form.get("url"),
          approve: form.get("approve") === "on",
        }),
      });
      const data = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || "登録に失敗しました");
      setResult(data);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6"
    >
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-lime-300" />
        <div>
          <h2 className="font-black">TikTok動画を審査登録</h2>
          <p className="text-xs text-white/45">
            公式・許諾済み動画だけを登録してください
          </p>
        </div>
      </div>
      <label className="block">
        <span className="text-xs font-bold text-white/60">映画ID</span>
        <input
          name="movieId"
          required
          className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-lime-300"
          placeholder="Supabase movie UUID"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-white/60">TikTok URL</span>
        <input
          name="url"
          type="url"
          required
          className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-lime-300"
          placeholder="https://www.tiktok.com/@creator/video/..."
        />
      </label>
      <label className="flex items-center gap-3 rounded-xl bg-black/20 p-4 text-sm">
        <input
          name="approve"
          type="checkbox"
          className="size-4 accent-lime-300"
        />
        oEmbed確認後すぐ公開承認する
      </label>
      <button
        type="submit"
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-300 font-black text-zinc-950 disabled:opacity-50"
      >
        {loading && <LoaderCircle className="animate-spin" size={18} />}
        検証して登録
      </button>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      )}
      {result && (
        <div className="flex gap-3 rounded-xl bg-lime-300/10 p-4 text-sm text-lime-200">
          <CheckCircle2 className="shrink-0" size={19} />
          <p>
            {result.authorName}「{result.title || result.videoId}」を
            {result.status === "approved" ? "公開登録" : "審査待ち登録"}
            しました。
          </p>
        </div>
      )}
    </form>
  );
}
