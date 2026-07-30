import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/domain");
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(typeof body.error.requestId).toBe("string");
  });

  it("rejects a request with an incorrect Bearer token", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/domain", {
      headers: authHeaders({ Authorization: "Bearer wrong-key" }),
    });
    expect(response.status).toBe(401);
  });

  it("accepts a request with the correct Bearer token", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/domain", {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
  });
});

describe("GET /v1/diagnostics/domain", () => {
  it("reports supported formats and domain limits with no database dependency", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/domain", {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.supportedMimeTypes).toContain("image/png");
    expect(body.supportedExtensions).toContain("png");
    expect(body.supportedOperations).toContain("resize");
    expect(body.dimensionLimits).toEqual({ min: 1, max: 8192 });
    expect(body.maxOperationsPerPreset).toBe(12);
  });
});

describe("GET /v1/diagnostics/database", () => {
  it("reports real local D1 state (migrations applied, table counts)", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/database", {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.available).toBe(true);
    expect(body.migrationsApplied).toEqual(expect.arrayContaining(["0001_initial_schema.sql"]));
    expect(typeof body.projectCount).toBe("number");
    expect(typeof body.assetCount).toBe("number");
    expect(typeof body.presetCount).toBe("number");
  });

  it("never includes a raw error message or internal path in its response body", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/database", {
      headers: authHeaders(),
    });
    const text = await response.text();
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain(".wrangler");
  });
});

describe("GET /v1/diagnostics/providers", () => {
  it("reports the configured local providers and their capabilities", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/providers", {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.valid).toBe(true);
    expect(body.storageProvider).toBe("r2");
    expect(body.transformationProvider).toBe("mock");
    expect(body.capabilities).toMatchObject({
      mock: { provider: "mock" },
      cloudflare: { provider: "cloudflare" },
      cloudinary: { provider: "cloudinary" },
    });
  });

  it("never exposes a secret field, even when absent", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/providers", {
      headers: authHeaders(),
    });
    const text = await response.text();
    expect(text.toLowerCase()).not.toContain("secret");
    expect(text.toLowerCase()).not.toContain("apikey");
  });
});

describe("GET /v1/diagnostics/seed", () => {
  it("reports seed state derived from real repository queries", async () => {
    const response = await SELF.fetch("https://example.com/v1/diagnostics/seed", {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.seeded).toBe("boolean");
    expect(typeof body.seedProjectCount).toBe("number");
    expect(Array.isArray(body.seedProjectSlugs)).toBe(true);
    expect(typeof body.systemPresetCount).toBe("number");
  });
});
