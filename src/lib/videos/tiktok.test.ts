import { describe, expect, it } from "vitest";
import { validateTikTokUrl } from "@/lib/videos/tiktok";

describe("validateTikTokUrl", () => {
  it("normalizes a TikTok video URL", () => {
    expect(
      validateTikTokUrl(
        "https://www.tiktok.com/@studio/video/123456789?is_from_webapp=1",
      ),
    ).toBe("https://www.tiktok.com/@studio/video/123456789");
  });

  it("accepts official short links", () => {
    expect(validateTikTokUrl("https://vt.tiktok.com/ABC123/")).toBe(
      "https://vt.tiktok.com/ABC123/",
    );
  });

  it("rejects lookalike and insecure hosts", () => {
    expect(() =>
      validateTikTokUrl("https://tiktok.com.example.com/video/123"),
    ).toThrow("TikTok");
    expect(() => validateTikTokUrl("http://www.tiktok.com/video/123")).toThrow(
      "TikTok",
    );
  });
});
