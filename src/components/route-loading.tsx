type RouteLoadingProps = {
  variant: "discover" | "search" | "me";
};

function LoadingStatus({ label }: { label: string }) {
  return (
    <p className="sr-only" role="status">
      {label}を読み込み中
    </p>
  );
}

export function RouteLoading({ variant }: RouteLoadingProps) {
  if (variant === "search") {
    return (
      <div
        aria-busy="true"
        className="min-h-dvh bg-[#f4f1e8] pb-28 text-zinc-950"
        data-route-loading="search"
      >
        <LoadingStatus label="検索画面" />
        <div className="border-b border-black/10 bg-[#f4f1e8]/95 px-4 py-4">
          <div className="mx-auto max-w-6xl animate-pulse">
            <div className="h-12 rounded-2xl bg-black/10" />
            <div className="mt-3 flex gap-2 overflow-hidden">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="h-9 w-24 shrink-0 rounded-full bg-black/10"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl animate-pulse px-4 py-8">
          <div className="h-3 w-28 rounded-full bg-black/10" />
          <div className="mt-3 h-8 w-72 max-w-full rounded-lg bg-black/10" />
          <div className="mt-8 flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="w-36 shrink-0">
                <div className="aspect-[2/3] rounded-2xl bg-black/10" />
                <div className="mt-3 h-4 rounded bg-black/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "me") {
    return (
      <div
        aria-busy="true"
        className="min-h-dvh bg-zinc-950 pb-28 text-white"
        data-route-loading="me"
      >
        <LoadingStatus label="マイページ" />
        <div className="border-b border-white/10 px-5 py-5">
          <div className="mx-auto flex max-w-5xl animate-pulse justify-between">
            <div className="h-8 w-28 rounded-lg bg-white/10" />
            <div className="h-9 w-24 rounded-full bg-white/10" />
          </div>
        </div>
        <div className="mx-auto max-w-5xl animate-pulse px-5 py-9">
          <div className="rounded-[2rem] border border-white/10 bg-zinc-900 p-6 md:p-9">
            <div className="h-3 w-28 rounded-full bg-lime-300/20" />
            <div className="mt-4 h-9 w-64 max-w-full rounded-lg bg-white/10" />
            <div className="mt-8 grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-28 rounded-2xl bg-black/25" />
              ))}
            </div>
          </div>
          <div className="mt-10 h-6 w-44 rounded bg-white/10" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="aspect-[2/3] rounded-2xl bg-white/10"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      className="relative min-h-dvh overflow-hidden bg-zinc-950 text-white"
      data-route-loading="discover"
    >
      <LoadingStatus label="見つける画面" />
      <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-white/5 via-zinc-950 to-black" />
      <div className="relative flex min-h-dvh animate-pulse flex-col justify-between px-5 pb-28 pt-6">
        <div className="flex justify-between">
          <div className="h-9 w-28 rounded-xl bg-white/10" />
          <div className="h-9 w-28 rounded-full bg-white/10" />
        </div>
        <div className="max-w-lg">
          <div className="h-3 w-36 rounded-full bg-lime-300/20" />
          <div className="mt-4 h-11 w-72 max-w-full rounded-lg bg-white/10" />
          <div className="mt-3 h-4 w-full rounded bg-white/10" />
          <div className="mt-2 h-4 w-4/5 rounded bg-white/10" />
          <div className="mt-6 flex gap-3">
            <div className="h-11 w-32 rounded-full bg-white/10" />
            <div className="h-11 w-11 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
