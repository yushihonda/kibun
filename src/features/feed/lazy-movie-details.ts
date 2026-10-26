"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

const loadMovieFeed = () => import("@/features/feed/movie-feed");
const loadCommentSection = () => import("@/features/community/comment-section");

export const LazyMovieDetails = dynamic(() =>
  loadMovieFeed().then((module) => module.MovieDetails),
);

// Fetches the detail sheet code while the browser is idle, so the first tap
// on a title opens it without waiting for the chunk download.
export function usePreloadMovieDetails() {
  useEffect(() => {
    const preload = () => {
      void loadMovieFeed();
      void loadCommentSection();
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(preload, { timeout: 4_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(preload, 1_500);
    return () => window.clearTimeout(handle);
  }, []);
}
