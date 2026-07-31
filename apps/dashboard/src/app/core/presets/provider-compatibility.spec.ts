import type { ImageOperation } from "@imageryx/contracts";
import { describe, expect, it } from "vitest";
import { computeProviderCompatibility } from "./provider-compatibility";

describe("computeProviderCompatibility", () => {
  it("reports all three providers", () => {
    const entries = computeProviderCompatibility([], "auto");
    expect(entries.map((e) => e.provider)).toEqual([
      "mock",
      "cloudflare",
      "cloudinary",
    ]);
  });

  it("marks a resize-only preset supported everywhere", () => {
    const operations: ImageOperation[] = [
      { type: "resize", width: 320, fit: "cover" },
    ];
    const entries = computeProviderCompatibility(operations, "auto");
    expect(entries.every((e) => e.supported)).toBe(true);
  });

  it("flags grayscale as a real Cloudflare gap, per context.md's documented capability limits", () => {
    const operations: ImageOperation[] = [{ type: "grayscale", enabled: true }];
    const entries = computeProviderCompatibility(operations, "auto");
    const cloudflare = entries.find((e) => e.provider === "cloudflare");
    expect(cloudflare?.supported).toBe(false);
    expect(cloudflare?.unsupportedOperations).toContain("grayscale");

    // Cloudinary and the mock provider both support the full operation set.
    expect(entries.find((e) => e.provider === "cloudinary")?.supported).toBe(
      true,
    );
    expect(entries.find((e) => e.provider === "mock")?.supported).toBe(true);
  });

  it("flags manual crop as unsupported by Cloudflare's gravity-based fit", () => {
    const operations: ImageOperation[] = [
      { type: "crop", x: 0, y: 0, width: 100, height: 100 },
    ];
    const entries = computeProviderCompatibility(operations, "auto");
    expect(entries.find((e) => e.provider === "cloudflare")?.supported).toBe(
      false,
    );
  });
});
