const DAY_MS = 86_400_000;

export function prioritizeLeastRecentlyRefreshed<T extends { id: string }>(
  candidates: T[],
  refreshedAt: ReadonlyMap<string, number>,
  priorityScore: (candidate: T) => number,
): T[] {
  return [...candidates].sort(
    (a, b) =>
      (refreshedAt.get(a.id) ?? 0) - (refreshedAt.get(b.id) ?? 0) ||
      priorityScore(b) - priorityScore(a) ||
      a.id.localeCompare(b.id),
  );
}

export function selectBalancedMediaCandidates<
  T extends { id: string; media_type: "movie" | "tv" },
>(candidates: T[], count: number): T[] {
  const targetCount = Math.min(
    candidates.length,
    Math.max(0, Math.floor(count)),
  );
  if (targetCount <= 1) return candidates.slice(0, targetCount);
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  for (const mediaType of ["movie", "tv"] as const) {
    const candidate = candidates.find(
      (item) => item.media_type === mediaType && !selectedIds.has(item.id),
    );
    if (!candidate) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }
  for (const candidate of candidates) {
    if (selected.length >= targetCount) break;
    if (selectedIds.has(candidate.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }
  return selected;
}

export function selectRotatingCandidates<T>(
  candidates: T[],
  count: number,
  now = new Date(),
  intervalDays = 1,
): T[] {
  if (!candidates.length || count <= 0) return [];
  const selectedCount = Math.min(candidates.length, Math.floor(count));
  const utcDay = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) /
      DAY_MS,
  );
  const runIndex = Math.floor(utcDay / Math.max(1, Math.floor(intervalDays)));
  const offset = (runIndex * selectedCount) % candidates.length;
  return Array.from(
    { length: selectedCount },
    (_, index) => candidates[(offset + index) % candidates.length],
  );
}
