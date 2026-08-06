"use client";

import { useEffect } from "react";
import {
  clearPendingInteractions,
  readPendingInteractions,
} from "@/lib/auth/pending-actions";

export function PendingActionRestorer() {
  useEffect(() => {
    const pending = readPendingInteractions();
    if (!pending.length) return;
    const restore = async () => {
      for (const interaction of pending) {
        const response = await fetch(
          `/api/movies/${interaction.movieId}/interaction`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(interaction.payload),
          },
        );
        if (!response.ok) return;
      }
      clearPendingInteractions();
    };
    void restore();
  }, []);

  return null;
}
