"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReportActions({
  reportId,
  hidden,
}: {
  reportId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (action: "hide" | "dismiss" | "restore") => {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (response.ok) router.refresh();
    else setError("処理できませんでした。");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hidden ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => act("restore")}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold disabled:opacity-50"
        >
          再表示する
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => act("hide")}
          className="rounded-full bg-rose-300 px-4 py-2 text-xs font-black text-zinc-950 disabled:opacity-50"
        >
          非表示にする
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => act("dismiss")}
        className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold disabled:opacity-50"
      >
        問題なし
      </button>
      {error && <span className="text-xs text-rose-300">{error}</span>}
    </div>
  );
}
