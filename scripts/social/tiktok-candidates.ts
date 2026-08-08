const DAY_MS = 86_400_000;

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
