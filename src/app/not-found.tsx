import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-950 px-5 text-white">
      <div className="text-center">
        <p className="text-8xl font-black text-white/10">404</p>
        <h1 className="-mt-4 text-2xl font-black">この映画は見つかりません</h1>
        <Link
          href="/search"
          className="mt-6 inline-block rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-zinc-950"
        >
          別の一本を探す
        </Link>
      </div>
    </main>
  );
}
