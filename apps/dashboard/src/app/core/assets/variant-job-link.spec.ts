import type { ImageVariant, ProcessingJob } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import { findJobForVariant } from "./variant-job-link";

function variant(presetHash: string): ImageVariant {
  return {
    id: "v1",
    assetId: "a1",
    presetId: "p1",
    presetHash,
    provider: "mock",
    storageKey: null,
    deliveryUrl: null,
    mimeType: null,
    width: null,
    height: null,
    sizeBytes: null,
    checksum: null,
    status: "pending",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function job(
  id: string,
  presetHash: string,
  type: ProcessingJob["type"] = "generate-variant",
): ProcessingJob {
  return {
    id,
    projectId: "p",
    assetId: "a1",
    type,
    provider: "mock",
    status: "queued",
    input:
      type === "generate-variant"
        ? {
            type: "generate-variant",
            assetId: "a1",
            presetId: "p1",
            presetHash,
            persist: true,
          }
        : { type: "inspect-metadata", assetId: "a1" },
    result: null,
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    failedAt: null,
  };
}

describe("findJobForVariant", () => {
  it("matches a job by preset hash", () => {
    const jobs = [job("j1", "hash-a"), job("j2", "hash-b")];
    expect(findJobForVariant(variant("hash-b"), jobs)?.id).toBe("j2");
  });

  it("returns null when no job matches", () => {
    expect(
      findJobForVariant(variant("hash-x"), [job("j1", "hash-a")]),
    ).toBeNull();
  });

  it("ignores jobs of a different type even with a coincidentally matching field", () => {
    const jobs = [job("j1", "hash-a", "inspect-metadata")];
    expect(findJobForVariant(variant("hash-a"), jobs)).toBeNull();
  });
});
