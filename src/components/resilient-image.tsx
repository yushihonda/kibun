"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

type ResilientImageProps = ImageProps & {
  fallbackSrc?: string;
};

export function ResilientImage({
  src,
  fallbackSrc = "/placeholder-movie.svg",
  alt,
  onError,
  ...props
}: ResilientImageProps) {
  const [failedSrc, setFailedSrc] = useState<ImageProps["src"] | null>(null);
  const failed = failedSrc === src;

  return (
    <Image
      {...props}
      src={failed ? fallbackSrc : src}
      alt={alt}
      onError={(event) => {
        if (!failed) setFailedSrc(src);
        onError?.(event);
      }}
    />
  );
}
