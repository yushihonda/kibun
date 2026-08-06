"use client";

export type PendingInteraction = {
  movieId: string;
  payload: {
    status?: "WATCHED" | "WATCHLIST" | "NONE";
    isFavorite?: boolean;
    rating?: number | null;
  };
  createdAt: string;
};

const STORAGE_KEY = "kibun:pending-interactions";

export function savePendingInteraction(
  movieId: string,
  payload: PendingInteraction["payload"],
) {
  const pending = readPendingInteractions().filter(
    (interaction) => interaction.movieId !== movieId,
  );
  pending.push({ movieId, payload, createdAt: new Date().toISOString() });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending.slice(-20)));
}

export function readPendingInteractions(): PendingInteraction[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is PendingInteraction =>
            entry &&
            typeof entry.movieId === "string" &&
            typeof entry.payload === "object",
        )
      : [];
  } catch {
    return [];
  }
}

export function clearPendingInteractions() {
  window.localStorage.removeItem(STORAGE_KEY);
}
