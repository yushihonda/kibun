"use client";

import { RotateCcw } from "lucide-react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-950 px-5 text-white">
      <div className="max-w-md text-center">
        <p className="text-sm font-black tracking-[0.2em] text-lime-300">
          KIBUN
        </p>
        <h1 className="mt-3 text-3xl font-black">うまく読み込めませんでした</h1>
        <p className="mt-3 text-sm text-white/55">
          通信状態を確認して、もう一度お試しください。
        </p>
        <button
          type="button"
          onClick={reset}
          className="mx-auto mt-6 flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-zinc-950"
        >
          <RotateCcw size={17} />
          再読み込み
        </button>
      </div>
    </main>
  );
}
