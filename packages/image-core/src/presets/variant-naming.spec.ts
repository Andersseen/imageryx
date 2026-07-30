import { describe, expect, it } from "vitest";
import { buildVariantObjectName } from "./variant-naming";

describe("buildVariantObjectName", () => {
  it("combines asset id, preset hash, and extension deterministically", () => {
    expect(buildVariantObjectName("asset-1", "hash-abc", "webp")).toBe(
      "asset-1-hash-abc.webp",
    );
  });

  it("is deterministic for the same input", () => {
    expect(buildVariantObjectName("asset-1", "hash-abc", "webp")).toBe(
      buildVariantObjectName("asset-1", "hash-abc", "webp"),
    );
  });

  it("produces different names when the preset hash differs (not tied to a preset slug)", () => {
    expect(buildVariantObjectName("asset-1", "hash-a", "webp")).not.toBe(
      buildVariantObjectName("asset-1", "hash-b", "webp"),
    );
  });
});
