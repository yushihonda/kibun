import { describe, expect, it } from "vitest";
import { expandProviderSlugs, normalizeProviders } from "./catalog";

describe("provider catalog", () => {
  it("expands canonical service slugs to the stored TMDB provider slugs", () => {
    expect(expandProviderSlugs(["netflix", "prime-video"])).toEqual([
      "netflix",
      "netflix-standard-with-ads",
      "amazon-prime-video",
      "amazon-video",
      "amazon-prime-video-with-ads",
    ]);
  });

  it("accepts a stored alias and keeps unknown provider slugs", () => {
    expect(
      expandProviderSlugs(["Netflix-Standard-With-Ads", "custom-service"]),
    ).toEqual(["netflix", "netflix-standard-with-ads", "custom-service"]);
  });

  it("normalizes plan variants and removes duplicate service offers", () => {
    expect(
      normalizeProviders([
        {
          id: 8,
          name: "Netflix",
          slug: "netflix",
          type: "flatrate",
        },
        {
          id: 1796,
          name: "Netflix Standard with Ads",
          slug: "netflix-standard-with-ads",
          type: "flatrate",
        },
        {
          id: 10,
          name: "Amazon Video",
          slug: "amazon-video",
          type: "rent",
        },
      ]),
    ).toEqual([
      {
        id: 8,
        name: "Netflix",
        slug: "netflix",
        type: "flatrate",
      },
      {
        id: 10,
        name: "Prime Video",
        slug: "prime-video",
        type: "rent",
      },
    ]);
  });
});
