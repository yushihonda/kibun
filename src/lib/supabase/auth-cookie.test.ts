import { describe, expect, it } from "vitest";
import { hasSupabaseAuthCookie } from "./auth-cookie";

describe("hasSupabaseAuthCookie", () => {
  it("recognizes regular and chunked Supabase session cookies", () => {
    expect(hasSupabaseAuthCookie([{ name: "sb-project-auth-token" }])).toBe(
      true,
    );
    expect(hasSupabaseAuthCookie([{ name: "sb-project-auth-token.0" }])).toBe(
      true,
    );
  });

  it("does not treat unrelated cookies as an authenticated session", () => {
    expect(
      hasSupabaseAuthCookie([{ name: "theme" }, { name: "kibun-session" }]),
    ).toBe(false);
  });
});
