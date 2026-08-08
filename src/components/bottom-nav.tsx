"use client";

import { Compass, Search, UserRound } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RouteLoading } from "@/components/route-loading";

const items = [
  { href: "/", label: "見つける", icon: Compass, variant: "discover" },
  { href: "/search", label: "検索", icon: Search, variant: "search" },
  { href: "/me", label: "マイページ", icon: UserRound, variant: "me" },
] as const;

function NavItemContent({
  active,
  icon: Icon,
  label,
}: {
  active: boolean;
  icon: typeof Compass;
  label: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span className="relative grid size-5 place-items-center">
        <Icon
          aria-hidden="true"
          className={`transition-opacity ${pending ? "opacity-25" : "opacity-100"}`}
          size={20}
          strokeWidth={active ? 2.5 : 1.8}
        />
        <span
          aria-hidden="true"
          className={`absolute size-4 rounded-full border-2 border-current border-t-transparent transition-opacity ${
            pending ? "animate-spin opacity-100" : "opacity-0"
          }`}
        />
      </span>
      <span className={pending ? "opacity-70" : undefined}>{label}</span>
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const prefetchTimer = useRef<number | null>(null);
  const prefetchedHrefs = useRef(new Set<string>());
  const [pendingHref, setPendingHref] = useState<
    (typeof items)[number]["href"] | null
  >(null);
  const pendingItem = items.find(({ href }) => {
    if (href !== pendingHref) return false;
    return href === "/" ? pathname !== "/" : !pathname.startsWith(href);
  });

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => setPendingHref(null), 15_000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  function cancelScheduledPrefetch() {
    if (prefetchTimer.current === null) return;
    window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  }

  function schedulePrefetch(href: (typeof items)[number]["href"]) {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    if (active || prefetchedHrefs.current.has(href)) return;

    cancelScheduledPrefetch();
    prefetchTimer.current = window.setTimeout(() => {
      prefetchedHrefs.current.add(href);
      router.prefetch(href);
      prefetchTimer.current = null;
    }, 150);
  }

  return (
    <>
      {pendingItem && (
        <div className="pointer-events-none fixed inset-0 z-40">
          <RouteLoading variant={pendingItem.variant} />
        </div>
      )}
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
              prefetch={false}
              onPointerEnter={() => schedulePrefetch(href)}
              onPointerLeave={cancelScheduledPrefetch}
              onFocus={() => schedulePrefetch(href)}
              onBlur={cancelScheduledPrefetch}
              onNavigate={() => {
                cancelScheduledPrefetch();
                setPendingHref(href);
              }}
              className={`flex min-w-20 flex-col items-center gap-1 text-[10px] font-semibold transition ${
                active ? "text-lime-300" : "text-white/55 hover:text-white"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <NavItemContent active={active} icon={Icon} label={label} />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
