"use client";

import { useState } from "react";
import { ResilientImage as Image } from "@/components/resilient-image";
import {
  providerLogoUrl,
  providerOfferLabel,
  type ProviderService,
} from "@/lib/providers/catalog";

export function ProviderLogo({
  provider,
  size = 28,
  className = "",
}: {
  provider: Pick<ProviderService, "name" | "logoPath">;
  size?: number;
  className?: string;
}) {
  const src = providerLogoUrl(provider.logoPath, size > 44 ? "w154" : "w92");
  const [failedSrc, setFailedSrc] = useState<string>();

  if (!src || failedSrc === src) {
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-md bg-zinc-900 font-black text-white ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, size * 0.38),
        }}
      >
        {provider.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={`${provider.name} ロゴ`}
      width={size}
      height={size}
      sizes={`${size}px`}
      onError={() => setFailedSrc(src)}
      className={`shrink-0 rounded-md object-cover ${className}`}
    />
  );
}

export function ProviderBadge({
  provider,
  variant = "full",
}: {
  provider: ProviderService;
  variant?: "icon" | "full";
}) {
  if (variant === "icon") {
    return (
      <span title={provider.name} aria-label={provider.name}>
        <ProviderLogo provider={provider} />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <ProviderLogo provider={provider} size={32} />
      <span className="min-w-0 text-left leading-tight">
        <span className="block truncate font-black">{provider.name}</span>
        <span className="block text-[10px] font-semibold opacity-65">
          {providerOfferLabel(provider.offerTypes)}
        </span>
      </span>
    </span>
  );
}
