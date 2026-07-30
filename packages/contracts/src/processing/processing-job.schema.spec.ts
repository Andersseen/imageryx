import { describe, expect, it } from "vitest";
import {
  processingJobInputSchema,
  processingJobResultSchema,
} from "./processing-job.schema";

const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const PRESET_ID = "123e4567-e89b-42d3-a456-426614174001";
const VARIANT_ID = "123e4567-e89b-42d3-a456-426614174002";

describe("processingJobInputSchema", () => {
  it("accepts a generate-variant payload", () => {
    expect(
      processingJobInputSchema.safeParse({
        type: "generate-variant",
        assetId: ASSET_ID,
        presetId: PRESET_ID,
        presetHash: "abc123",
      }).success,
    ).toBe(true);
  });

  it("rejects a generate-variant payload missing presetId", () => {
    expect(
      processingJobInputSchema.safeParse({
        type: "generate-variant",
        assetId: ASSET_ID,
        presetHash: "abc123",
      }).success,
    ).toBe(false);
  });

  it("rejects an inspect-metadata payload missing its required assetId", () => {
    expect(
      processingJobInputSchema.safeParse({ type: "inspect-metadata" }).success,
    ).toBe(false);
  });

  it("rejects an unknown job type", () => {
    expect(
      processingJobInputSchema.safeParse({
        type: "resize-in-place",
        assetId: ASSET_ID,
      }).success,
    ).toBe(false);
  });

  it("accepts a batch-operation payload with bounded assetIds", () => {
    expect(
      processingJobInputSchema.safeParse({
        type: "batch-operation",
        assetIds: [ASSET_ID],
        presetId: PRESET_ID,
      }).success,
    ).toBe(true);
  });

  it("rejects a batch-operation payload with an empty assetIds array", () => {
    expect(
      processingJobInputSchema.safeParse({
        type: "batch-operation",
        assetIds: [],
        presetId: PRESET_ID,
      }).success,
    ).toBe(false);
  });

  it("accepts a copy-provider-result payload with a valid URL", () => {
    expect(
      processingJobInputSchema.safeParse({
        type: "copy-provider-result",
        assetId: ASSET_ID,
        variantId: VARIANT_ID,
        sourceUrl: "https://example.com/result.png",
      }).success,
    ).toBe(true);
  });
});

describe("processingJobResultSchema", () => {
  it("accepts an inspect-metadata result", () => {
    expect(
      processingJobResultSchema.safeParse({
        type: "inspect-metadata",
        width: 800,
        height: 600,
        hasAlpha: false,
        dominantColor: "#ffffff",
      }).success,
    ).toBe(true);
  });

  it("rejects a result type that does not exist", () => {
    expect(
      processingJobResultSchema.safeParse({ type: "unknown-result" }).success,
    ).toBe(false);
  });
});
