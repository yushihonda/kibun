import { describe, expect, it } from "vitest";
import { createContentSecurityPolicy } from "./csp";

describe("content security policy", () => {
  it("uses a nonce and locks down dangerous embedding in production", () => {
    const policy = createContentSecurityPolicy("test-nonce", false);

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("only permits the supported video origins as frames", () => {
    const policy = createContentSecurityPolicy("test-nonce", false);

    expect(policy).toContain(
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com",
    );
  });
});
