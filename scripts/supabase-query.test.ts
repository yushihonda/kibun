import { describe, expect, it, vi } from "vitest";
import { describeError, retrySupabaseQuery } from "./supabase-query";

describe("retrySupabaseQuery", () => {
  it("retries Supabase errors and returns the first successful result", async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "57014" } })
      .mockResolvedValueOnce({ data: [1], error: null });

    const result = await retrySupabaseQuery<{
      data: number[] | null;
      error: unknown;
    }>("load rows", operation, { delayMs: 0 });

    expect(result.data).toEqual([1]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("includes object-shaped Supabase errors in the final message", async () => {
    await expect(
      retrySupabaseQuery(
        "update movie",
        () => Promise.resolve({ data: null, error: { code: "57014" } }),
        { attempts: 2, delayMs: 0 },
      ),
    ).rejects.toThrow('update movie failed after 2 attempts: {"code":"57014"}');
  });
});

describe("describeError", () => {
  it("formats Error instances", () => {
    expect(describeError(new Error("network unavailable"))).toBe(
      "network unavailable",
    );
  });
});
