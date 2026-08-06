import { describe, expect, it } from "vitest";
import { formatRuntime } from "@/lib/utils";

describe("formatRuntime", () => {
  it("formats minutes under one hour", () => {
    expect(formatRuntime(52)).toBe("52分");
  });

  it("formats hours and remaining minutes", () => {
    expect(formatRuntime(128)).toBe("2時間8分");
  });

  it("omits zero remaining minutes", () => {
    expect(formatRuntime(120)).toBe("2時間");
  });
});
