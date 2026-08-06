import type { Provider } from "@/types/movie";

type ProviderGroup = {
  label: string;
  slug: string;
  tmdbProviderIds: readonly number[];
  sourceSlugs: readonly string[];
};

export const PROVIDER_FILTERS = [
  {
    label: "Netflix",
    slug: "netflix",
    tmdbProviderIds: [8, 1796],
    sourceSlugs: ["netflix", "netflix-standard-with-ads"],
  },
  {
    label: "Prime Video",
    slug: "prime-video",
    tmdbProviderIds: [9, 10, 2100],
    sourceSlugs: [
      "amazon-prime-video",
      "amazon-video",
      "amazon-prime-video-with-ads",
    ],
  },
  {
    label: "U-NEXT",
    slug: "u-next",
    tmdbProviderIds: [84],
    sourceSlugs: ["u-next"],
  },
  {
    label: "Disney+",
    slug: "disney-plus",
    tmdbProviderIds: [337],
    sourceSlugs: ["disney-plus"],
  },
  {
    label: "Hulu",
    slug: "hulu",
    tmdbProviderIds: [15],
    sourceSlugs: ["hulu"],
  },
  {
    label: "Apple TV",
    slug: "apple-tv",
    tmdbProviderIds: [2, 350],
    sourceSlugs: ["apple-tv-store", "apple-tv"],
  },
  {
    label: "FOD",
    slug: "fod",
    tmdbProviderIds: [2683],
    sourceSlugs: ["fod"],
  },
] as const satisfies readonly ProviderGroup[];

const providerById = new Map<number, ProviderGroup>();
const providerBySlug = new Map<string, ProviderGroup>();

for (const provider of PROVIDER_FILTERS) {
  for (const id of provider.tmdbProviderIds) providerById.set(id, provider);
  providerBySlug.set(provider.slug, provider);
  for (const slug of provider.sourceSlugs) providerBySlug.set(slug, provider);
}

export function expandProviderSlugs(slugs: readonly string[]): string[] {
  return [
    ...new Set(
      slugs.flatMap((slug) => {
        const normalized = slug.trim().toLowerCase();
        return providerBySlug.get(normalized)?.sourceSlugs ?? [normalized];
      }),
    ),
  ].filter(Boolean);
}

export function normalizeProviders(providers: readonly Provider[]): Provider[] {
  const normalized = providers.map((provider) => {
    const group =
      providerById.get(provider.id) ?? providerBySlug.get(provider.slug);
    return group
      ? { ...provider, name: group.label, slug: group.slug }
      : provider;
  });

  return normalized.filter(
    (provider, index) =>
      normalized.findIndex(
        (candidate) =>
          candidate.slug === provider.slug && candidate.type === provider.type,
      ) === index,
  );
}
