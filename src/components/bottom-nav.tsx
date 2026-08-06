"use client";

import { Compass, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "見つける", icon: Compass },
  { href: "/search", label: "検索", icon: Search },
  { href: "/me", label: "マイページ", icon: UserRound },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-16 max-w-lg items-center justify-around border-t border-white/10 bg-zinc-950/90 px-6 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:bottom-5 md:rounded-2xl md:border"
      aria-label="メインナビゲーション"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-w-20 flex-col items-center gap-1 text-[10px] font-semibold transition ${
              active ? "text-lime-300" : "text-white/55 hover:text-white"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
