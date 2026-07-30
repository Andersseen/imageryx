import { ProjectRepository } from "@imageryx/database";
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("GET /v1/stats", () => {
  it("returns aggregate counters derived from real queries", async () => {
    await new ProjectRepository(env.DB).create({
      name: "Stats Test",
      slug: `stats-test-${crypto.randomUUID()}`,
    });

    const response = await SELF.fetch("https://example.com/v1/stats", {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      projectCount: number;
      activeAssetCount: number;
      assetsByFormat: unknown[];
      recentActivity: unknown[];
    };
    expect(body.projectCount).toBeGreaterThan(0);
    expect(typeof body.activeAssetCount).toBe("number");
    expect(Array.isArray(body.assetsByFormat)).toBe(true);
    expect(Array.isArray(body.recentActivity)).toBe(true);
  });

  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/v1/stats");
    expect(response.status).toBe(401);
  });
});
