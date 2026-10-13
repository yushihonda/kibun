"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResilientImage as Image } from "@/components/resilient-image";

const GENRES = [
  "アクション",
  "アニメーション",
  "コメディ",
  "ドラマ",
  "ファミリー",
  "ホラー",
  "ロマンス",
  "サイエンスフィクション",
] as const;

const EMOTIONS = [
  "泣ける",
  "笑える",
  "癒やし",
  "爽快",
  "心温まる",
  "緊張感",
  "考えさせられる",
  "ロマンチック",
] as const;

type ChoiceMovie = { id: string; title: string; posterUrl: string };

function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function PersonalizationSettings({
  initialEnabled,
  initialGenres,
  initialEmotions,
  initialFavoriteMovieIds,
  movieChoices,
}: {
  initialEnabled: boolean;
  initialGenres: string[];
  initialEmotions: string[];
  initialFavoriteMovieIds: string[];
  movieChoices: ChoiceMovie[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [genres, setGenres] = useState(initialGenres);
  const [emotions, setEmotions] = useState(initialEmotions);
  const selectableMovieIds = new Set(movieChoices.map((movie) => movie.id));
  const initialSelectableFavorites = initialFavoriteMovieIds.filter((id) =>
    selectableMovieIds.has(id),
  );
  const [favoriteMovieIds, setFavoriteMovieIds] = useState(
    initialSelectableFavorites,
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalizationEnabled: enabled,
        preferredGenres: genres,
        preferredEmotions: emotions,
        favoriteMovieIds,
        removedFavoriteMovieIds: initialSelectableFavorites.filter(
          (movieId) => !favoriteMovieIds.includes(movieId),
        ),
        onboardingCompleted: true,
      }),
    });
    setMessage(response.ok ? "好みを保存しました" : "保存できませんでした");
    setSaving(false);
  };

  const clearHistory = async () => {
    if (!window.confirm("検索・閲覧・推薦フィードバック履歴を削除しますか？")) {
      return;
    }
    const response = await fetch("/api/preferences", { method: "DELETE" });
    setMessage(
      response.ok ? "パーソナライズ履歴を削除しました" : "削除できませんでした",
    );
  };

  const deleteAccount = async () => {
    if (
      !window.confirm(
        "アカウントと映画棚、評価、レビューを完全に削除します。この操作は元に戻せません。",
      )
    ) {
      return;
    }
    const response = await fetch("/api/account", { method: "DELETE" });
    if (response.ok) {
      router.replace("/");
      router.refresh();
    } else setMessage("アカウントを削除できませんでした");
  };

  return (
    <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-5 md:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-lime-300">
            PERSONALIZATION
          </p>
          <h2 className="mt-1 text-xl font-black">おすすめの設定</h2>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-5 accent-lime-300"
          />
          パーソナライズ
        </label>
      </div>

      <fieldset className="mt-6" disabled={!enabled}>
        <legend className="text-sm font-bold">好きな気分</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {EMOTIONS.map((emotion) => (
            <button
              key={emotion}
              type="button"
              aria-pressed={emotions.includes(emotion)}
              onClick={() => setEmotions((current) => toggle(current, emotion))}
              className={`rounded-full border px-3 py-2 text-xs font-bold ${emotions.includes(emotion) ? "border-lime-300 bg-lime-300 text-zinc-950" : "border-white/15"}`}
            >
              {emotion}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6" disabled={!enabled}>
        <legend className="text-sm font-bold">好きなジャンル</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              aria-pressed={genres.includes(genre)}
              onClick={() => setGenres((current) => toggle(current, genre))}
              className={`rounded-full border px-3 py-2 text-xs font-bold ${genres.includes(genre) ? "border-lime-300 bg-lime-300 text-zinc-950" : "border-white/15"}`}
            >
              {genre}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6" disabled={!enabled}>
        <legend className="text-sm font-bold">好きな作品</legend>
        <p className="mt-1 text-xs text-white/70">
          3件以上選ぶと推薦が安定します。
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {movieChoices.map((movie) => {
            const selected = favoriteMovieIds.includes(movie.id);
            return (
              <button
                key={movie.id}
                type="button"
                aria-pressed={selected}
                aria-label={`${movie.title}を好きな作品に${selected ? "選択済み" : "追加"}`}
                onClick={() =>
                  setFavoriteMovieIds((current) => toggle(current, movie.id))
                }
                className={`relative aspect-[2/3] overflow-hidden rounded-xl border-2 ${selected ? "border-lime-300" : "border-transparent"}`}
              >
                <Image
                  src={movie.posterUrl}
                  alt={`${movie.title} ポスター`}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/75 p-1 text-[9px] font-bold">
                  {movie.title}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="mt-6 w-full rounded-full bg-lime-300 py-3 text-sm font-black text-zinc-950 disabled:opacity-50"
      >
        設定を保存
      </button>
      <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-5">
        <button
          type="button"
          onClick={clearHistory}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold"
        >
          推薦履歴を削除
        </button>
        <button
          type="button"
          onClick={deleteAccount}
          className="rounded-full border border-rose-400/40 px-4 py-2 text-xs font-bold text-rose-300"
        >
          アカウントを削除
        </button>
      </div>
      {message && <p className="mt-3 text-xs text-white/60">{message}</p>}
    </section>
  );
}
