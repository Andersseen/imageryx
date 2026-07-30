import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /v1/diagnostics/domain", () => {
  it("reports supported formats and domain limits with no database dependency", async () => {
    const response = await SELF.fetch(
      "https://example.com/v1/diagnostics/domain",
    );
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
    const response = await SELF.fetch(
      "https://example.com/v1/diagnostics/database",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.available).toBe(true);
    expect(body.migrationsApplied).toEqual(
      expect.arrayContaining(["0001_initial_schema.sql"]),
    );
    expect(typeof body.projectCount).toBe("number");
    expect(typeof body.assetCount).toBe("number");
    expect(typeof body.presetCount).toBe("number");
  });

  it("never includes a raw error message or internal path in its response body", async () => {
    const response = await SELF.fetch(
      "https://example.com/v1/diagnostics/database",
    );
    const text = await response.text();
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain(".wrangler");
  });
});

describe("GET /v1/diagnostics/providers", () => {
  it("reports the configured local providers and their capabilities", async () => {
    const response = await SELF.fetch(
      "https://example.com/v1/diagnostics/providers",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.valid).toBe(true);
    expect(body.storageProvider).toBe("local");
    expect(body.transformationProvider).toBe("mock");
    expect(body.capabilities).toMatchObject({
      mock: { provider: "mock" },
      cloudflare: { provider: "cloudflare" },
      cloudinary: { provider: "cloudinary" },
    });
  });

  it("never exposes a secret field, even when absent", async () => {
    const response = await SELF.fetch(
      "https://example.com/v1/diagnostics/providers",
    );
    const text = await response.text();
    expect(text.toLowerCase()).not.toContain("secret");
    expect(text.toLowerCase()).not.toContain("apikey");
  });
});

describe("GET /v1/diagnostics/seed", () => {
  it("reports seed state derived from real repository queries", async () => {
    const response = await SELF.fetch(
      "https://example.com/v1/diagnostics/seed",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.seeded).toBe("boolean");
    expect(typeof body.seedProjectCount).toBe("number");
    expect(Array.isArray(body.seedProjectSlugs)).toBe(true);
    expect(typeof body.systemPresetCount).toBe("number");
  });
});
