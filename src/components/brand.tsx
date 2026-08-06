import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      prefetch={false}
      className="group inline-flex items-center gap-2"
      aria-label="KIBUN ホーム"
    >
      <span className="grid size-8 rotate-3 place-items-center rounded-xl bg-lime-300 text-sm font-black text-zinc-950 transition-transform group-hover:-rotate-3">
        K
      </span>
      <span className="font-black tracking-[0.18em] text-white">KIBUN</span>
      {!compact && (
        <span className="hidden text-xs text-white/60 sm:inline">
          気分で見つかる、次の一本。
        </span>
      )}
    </Link>
  );
}
