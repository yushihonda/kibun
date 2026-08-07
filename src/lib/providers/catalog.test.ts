import { describe, expect, it } from "vitest";
import {
  expandProviderSlugs,
  groupProviderServices,
  normalizeProviders,
  providerLogoUrl,
  providerOfferLabel,
} from "./catalog";

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

  it("groups offer types while preserving an official provider logo", () => {
    expect(
      groupProviderServices([
        {
          id: 8,
          name: "Netflix",
          slug: "netflix",
          type: "flatrate",
          logoPath: "/netflix.png",
        },
        {
          id: 8,
          name: "Netflix",
          slug: "netflix",
          type: "rent",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        name: "Netflix",
        slug: "netflix",
        logoPath: "/netflix.png",
        offerTypes: ["flatrate", "rent"],
      }),
    ]);
    expect(providerOfferLabel(["flatrate", "rent"])).toBe("見放題・レンタル");
    expect(providerLogoUrl("/netflix.png")).toBe(
      "https://image.tmdb.org/t/p/w92/netflix.png",
    );
    expect(providerLogoUrl("../unsafe.png")).toBeUndefined();
  });
});
