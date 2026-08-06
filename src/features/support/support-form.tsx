"use client";

import { type FormEvent, useState } from "react";

export function SupportForm() {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email") ?? ""),
        category: String(form.get("category") ?? "question"),
        body: String(form.get("body") ?? ""),
      }),
    });
    setSaving(false);
    if (response.ok) {
      event.currentTarget.reset();
      setMessage("受け付けました。内容を確認して対応します。");
    } else {
      setMessage("送信できませんでした。時間をおいて再度お試しください。");
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm font-bold">
        返信先メール（任意）
        <input
          type="email"
          name="email"
          maxLength={254}
          className="mt-2 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:ring-2 focus:ring-lime-300"
        />
      </label>
      <label className="block text-sm font-bold">
        種別
        <select
          name="category"
          className="mt-2 w-full rounded-2xl border border-white/15 bg-zinc-900 px-4 py-3"
        >
          <option value="question">一般的な問い合わせ</option>
          <option value="privacy">プライバシー・データ開示</option>
          <option value="deletion">データ削除</option>
          <option value="copyright">権利・掲載内容</option>
          <option value="other">その他</option>
        </select>
      </label>
      <label className="block text-sm font-bold">
        内容
        <textarea
          name="body"
          required
          minLength={10}
          maxLength={4000}
          className="mt-2 min-h-40 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:ring-2 focus:ring-lime-300"
        />
      </label>
      <button
        disabled={saving}
        className="w-full rounded-full bg-lime-300 py-3 font-black text-zinc-950 disabled:opacity-50"
      >
        送信する
      </button>
      {message && (
        <p role="status" className="text-sm text-white/65">
          {message}
        </p>
      )}
    </form>
  );
}
