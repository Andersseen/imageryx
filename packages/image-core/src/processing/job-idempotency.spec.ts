import { describe, expect, it } from "vitest";
import { buildGenerateVariantJobKey } from "./job-idempotency";

describe("buildGenerateVariantJobKey", () => {
  it("is deterministic for the same asset and preset hash", () => {
    expect(buildGenerateVariantJobKey("asset-1", "hash-a")).toBe(
      buildGenerateVariantJobKey("asset-1", "hash-a"),
    );
  });

  it("differs when the preset hash differs", () => {
    expect(buildGenerateVariantJobKey("asset-1", "hash-a")).not.toBe(
      buildGenerateVariantJobKey("asset-1", "hash-b"),
    );
  });

  it("differs when the asset differs", () => {
    expect(buildGenerateVariantJobKey("asset-1", "hash-a")).not.toBe(
      buildGenerateVariantJobKey("asset-2", "hash-a"),
    );
  });
});
