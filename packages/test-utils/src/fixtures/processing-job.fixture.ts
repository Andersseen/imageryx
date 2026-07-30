import type { ProcessingJob } from "@imageryx/contracts";

export function createProcessingJobFixture(
  overrides: Partial<ProcessingJob> = {},
): ProcessingJob {
  const now = new Date().toISOString();
  const assetId = overrides.assetId ?? crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    assetId,
    type: "inspect-metadata",
    provider: null,
    status: "queued",
    input: { type: "inspect-metadata", assetId },
    result: null,
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    ...overrides,
  };
}
