import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "./constant-time";

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("imgx_dev_local", "imgx_dev_local")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEqual("imgx_dev_local", "imgx_dev_locax")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(constantTimeEqual("short", "much-longer-value")).toBe(false);
  });

  it("returns false when one string is empty", () => {
    expect(constantTimeEqual("", "nonempty")).toBe(false);
  });

  it("returns true when both strings are empty", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
