import "server-only";

type CloudflareCacheStorage = CacheStorage & { default?: Cache };

function defaultCache(): Cache | null {
  if (typeof caches === "undefined") return null;
  return (caches as CloudflareCacheStorage).default ?? null;
}

function cacheRequest(key: string): Request {
  return new Request(`https://kibun.internal/cache/${key}`);
}

export async function readEdgeJson<T>(key: string): Promise<T | null> {
  const cache = defaultCache();
  if (!cache) return null;
  try {
    const response = await cache.match(cacheRequest(key));
    return response?.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function writeEdgeJson(
  key: string,
  value: unknown,
  maxAgeSeconds: number,
): Promise<void> {
  const cache = defaultCache();
  if (!cache) return;
  try {
    await cache.put(
      cacheRequest(key),
      Response.json(value, {
        headers: {
          "cache-control": `public, max-age=${maxAgeSeconds}`,
        },
      }),
    );
  } catch {
    // Local Node runtimes and restricted edge contexts use the memory fallback.
  }
}
