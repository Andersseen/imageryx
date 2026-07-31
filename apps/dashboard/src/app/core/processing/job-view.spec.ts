import { describe, expect, it } from "vitest";
import { processingJobFixture } from "../../testing/stub-client";
import {
  describeJobInput,
  describeJobResult,
  describeJobType,
  toJobView,
} from "./job-view";

describe("describeJobType", () => {
  it("labels every job type", () => {
    expect(describeJobType("generate-variant")).toBe("Generate variant");
    expect(describeJobType("delete-object")).toBe("Delete object");
    expect(describeJobType("batch-operation")).toBe("Batch operation");
  });
});

describe("describeJobInput", () => {
  it("never mentions a raw storage key for delete-object", () => {
    const summary = describeJobInput({
      type: "delete-object",
      storageKey: "derived/project-1/secret-key.jpg",
    });
    expect(summary).not.toContain("secret-key");
    expect(summary).toBe("Delete a stored object.");
  });

  it("notes when a generated variant is not persisted", () => {
    expect(
      describeJobInput({
        type: "generate-variant",
        assetId: "asset-1",
        presetId: "preset-1",
        presetHash: "h",
        persist: false,
      }),
    ).toContain("not persisted");
  });

  it("pluralizes a batch operation's asset count", () => {
    expect(
      describeJobInput({
        type: "batch-operation",
        assetIds: ["a"],
        presetId: "preset-1",
      }),
    ).toBe("Apply a preset to 1 asset.");
    expect(
      describeJobInput({
        type: "batch-operation",
        assetIds: ["a", "b"],
        presetId: "preset-1",
      }),
    ).toBe("Apply a preset to 2 assets.");
  });
});

describe("describeJobResult", () => {
  it("is null when there is no result yet", () => {
    expect(describeJobResult(null)).toBeNull();
  });

  it("summarizes a generate-variant result with size", () => {
    expect(
      describeJobResult({
        type: "generate-variant",
        variantId: "variant-1",
        storageKey: "k",
        width: 320,
        height: 240,
        sizeBytes: 2048,
      }),
    ).toBe("Variant generated at 320 × 240 (2.0 KB).");
  });

  it("summarizes a batch operation with failures called out", () => {
    expect(
      describeJobResult({
        type: "batch-operation",
        processedCount: 8,
        failedCount: 2,
      }),
    ).toBe("8 processed, 2 failed.");
    expect(
      describeJobResult({
        type: "batch-operation",
        processedCount: 10,
        failedCount: 0,
      }),
    ).toBe("10 processed.");
  });
});

describe("toJobView", () => {
  it("composes a full view from a job", () => {
    const job = processingJobFixture("job-1", "project-1", {
      type: "generate-variant",
    });
    const view = toJobView(job);
    expect(view.typeLabel).toBe("Generate variant");
    expect(view.inputSummary).toContain("Generate a variant");
    expect(view.resultSummary).toBeNull();
  });
});
