export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;

  try {
    const parsed = new URL(value, "http://local");
    if (parsed.origin !== "http://local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(safeNextPath(next))}`;
}
