import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    createClient.mockReset();
  });

  it("uses a planned count so the health check does not scan the catalog", async () => {
    const select = vi.fn().mockResolvedValue({ count: 28_664, error: null });
    const from = vi.fn().mockReturnValue({ select });
    createClient.mockResolvedValue({ from });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("movies");
    expect(select).toHaveBeenCalledWith("id", {
      head: true,
      count: "planned",
    });
    expect(body).toMatchObject({
      status: "ok",
      database: "reachable",
      movies: 28_664,
      moviesCountAccuracy: "estimated",
    });
  });

  it("reports an unconfigured database", async () => {
    createClient.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "degraded",
      database: "unconfigured",
    });
  });

  it("reports query failures without exposing database details", async () => {
    const select = vi.fn().mockResolvedValue({
      count: null,
      error: { message: "private database error" },
    });
    createClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      database: "error",
      movies: null,
      moviesCountAccuracy: "estimated",
    });
    expect(JSON.stringify(body)).not.toContain("private database error");
  });
});
