import { describe, expect, it } from "vitest";
import { InvalidStateTransitionError } from "../errors/domain-errors";
import {
  assertValidProcessingJobTransition,
  canTransitionProcessingJob,
} from "./job-transitions";

describe("processing job transitions", () => {
  it("allows queued -> processing", () => {
    expect(canTransitionProcessingJob("queued", "processing")).toBe(true);
    expect(() =>
      assertValidProcessingJobTransition("queued", "processing"),
    ).not.toThrow();
  });

  it("allows processing -> completed and processing -> failed", () => {
    expect(canTransitionProcessingJob("processing", "completed")).toBe(true);
    expect(canTransitionProcessingJob("processing", "failed")).toBe(true);
  });

  it("allows failed -> queued (retry)", () => {
    expect(canTransitionProcessingJob("failed", "queued")).toBe(true);
  });

  it("rejects completed -> processing (terminal state)", () => {
    expect(canTransitionProcessingJob("completed", "processing")).toBe(false);
    expect(() =>
      assertValidProcessingJobTransition("completed", "processing"),
    ).toThrow(InvalidStateTransitionError);
  });

  it("rejects queued -> completed (skipping processing)", () => {
    expect(canTransitionProcessingJob("queued", "completed")).toBe(false);
  });

  it("rejects cancelled -> anything (terminal state)", () => {
    expect(canTransitionProcessingJob("cancelled", "queued")).toBe(false);
  });
});
