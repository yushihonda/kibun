import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

export function CommunityShell({
  children,
  back,
}: {
  children: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <main className="min-h-dvh bg-zinc-950 pb-28 text-white">
      <header className="border-b border-white/10 px-5 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Brand compact />
          {back && (
            <Link
              href={back.href}
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold hover:bg-white/5"
            >
              ← {back.label}
            </Link>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-8">{children}</div>
    </main>
  );
}
