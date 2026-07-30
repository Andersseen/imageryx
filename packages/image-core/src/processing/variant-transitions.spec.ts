import { describe, expect, it } from "vitest";
import { InvalidStateTransitionError } from "../errors/domain-errors";
import {
  assertValidVariantTransition,
  canTransitionVariant,
} from "./variant-transitions";

describe("variant transitions", () => {
  it("allows pending -> processing -> ready", () => {
    expect(canTransitionVariant("pending", "processing")).toBe(true);
    expect(canTransitionVariant("processing", "ready")).toBe(true);
  });

  it("allows failed -> pending (retry)", () => {
    expect(canTransitionVariant("failed", "pending")).toBe(true);
  });

  it("rejects ready -> processing (terminal state)", () => {
    expect(canTransitionVariant("ready", "processing")).toBe(false);
    expect(() => assertValidVariantTransition("ready", "processing")).toThrow(
      InvalidStateTransitionError,
    );
  });

  it("rejects pending -> ready (skipping processing)", () => {
    expect(canTransitionVariant("pending", "ready")).toBe(false);
  });
});
