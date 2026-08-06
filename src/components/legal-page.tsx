import { Brand } from "@/components/brand";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-zinc-950 px-5 pb-28 text-white">
      <header className="mx-auto flex max-w-3xl items-center py-6">
        <Brand />
      </header>
      <article className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 md:p-10">
        <h1 className="text-3xl font-black">{title}</h1>
        <div className="mt-7 space-y-6 text-sm leading-7 text-white/70">
          {children}
        </div>
      </article>
    </main>
  );
}
