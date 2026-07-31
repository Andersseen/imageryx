import type { ProcessingJobStatus } from "@imageryx/contracts";
import { describe, expect, it } from "vitest";
import { isCancellable, isRetryable, isTerminal } from "./job-eligibility";

const ALL_STATUSES: ProcessingJobStatus[] = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
];

describe("isRetryable", () => {
  it("is true only for failed", () => {
    for (const status of ALL_STATUSES) {
      expect(isRetryable(status), status).toBe(status === "failed");
    }
  });
});

describe("isCancellable", () => {
  it("is true only for queued — a running job cannot be safely cancelled mid-flight", () => {
    for (const status of ALL_STATUSES) {
      expect(isCancellable(status), status).toBe(status === "queued");
    }
  });
});

describe("isTerminal", () => {
  it("treats completed, failed and cancelled as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("treats queued and processing as non-terminal", () => {
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal("processing")).toBe(false);
  });
});
