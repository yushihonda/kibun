"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ProfileSettings({
  userId,
  initialDisplayName,
  initialBio,
  initialShelfPublic,
}: {
  userId: string;
  initialDisplayName: string;
  initialBio: string;
  initialShelfPublic: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [shelfPublic, setShelfPublic] = useState(initialShelfPublic);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, bio, shelfPublic }),
    });
    setSaving(false);
    setMessage(
      response.ok ? "プロフィールを保存しました" : "保存できませんでした。",
    );
    if (response.ok) router.refresh();
  };

  return (
    <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-5 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-lime-300">
            COMMUNITY PROFILE
          </p>
          <h2 className="mt-1 text-xl font-black">プロフィール</h2>
        </div>
        <Link
          href={`/u/${userId}`}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold hover:bg-white/5"
        >
          公開プロフィールを見る
        </Link>
      </div>
      <form onSubmit={save} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-bold">表示名</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            maxLength={40}
            className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-lime-300"
          />
          <span className="mt-1 block text-xs text-white/65">
            コメントや掲示板で表示されます。本名は避けるのがおすすめです。
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-bold">自己紹介</span>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={300}
            placeholder="好きなジャンルや最近ハマった作品など"
            className="mt-2 min-h-20 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm outline-none placeholder:text-white/45 focus:ring-2 focus:ring-lime-300"
          />
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={shelfPublic}
            onChange={(event) => setShelfPublic(event.target.checked)}
            className="mt-0.5 size-4 accent-lime-300"
          />
          <span>
            <span className="block text-sm font-bold">作品棚を公開する</span>
            <span className="block text-xs text-white/65">
              見たい・見た・お気に入り・評価を、プロフィールで他の人に見せます。
            </span>
          </span>
        </label>
        <button
          disabled={saving || !displayName.trim()}
          className="w-full rounded-full bg-lime-300 py-3 text-sm font-black text-zinc-950 disabled:opacity-50"
        >
          プロフィールを保存
        </button>
        {message && <p className="text-xs text-white/70">{message}</p>}
      </form>
    </section>
  );
}
