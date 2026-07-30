import { describe, expect, it } from "vitest";
import { computeAspectRatio } from "./aspect-ratio";

describe("computeAspectRatio", () => {
  it("computes 16:9 to 4 decimal places", () => {
    expect(computeAspectRatio(1920, 1080)).toBe(1.7778);
  });

  it("computes a square aspect ratio as 1", () => {
    expect(computeAspectRatio(500, 500)).toBe(1);
  });

  it.each([
    [null, 100],
    [100, null],
    [undefined, 100],
    [0, 100],
    [100, 0],
    [-10, 100],
  ])("returns null for width=%s height=%s", (width, height) => {
    expect(
      computeAspectRatio(width as number | null, height as number | null),
    ).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(computeAspectRatio(Infinity, 100)).toBeNull();
  });
});
