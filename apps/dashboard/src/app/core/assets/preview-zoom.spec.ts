import { describe, expect, it } from "vitest";
import {
  ACTUAL_SIZE_STATE,
  canZoomIn,
  canZoomOut,
  FIT_STATE,
  MAX_SCALE,
  MIN_SCALE,
  resetZoom,
  setActualSize,
  zoomIn,
  zoomOut,
  zoomPercentLabel,
} from "./preview-zoom";

describe("zoomIn / zoomOut", () => {
  it("steps up from fit using 1x as the implicit baseline", () => {
    const next = zoomIn(FIT_STATE);
    expect(next.mode).toBe("custom");
    expect(next.scale).toBeCloseTo(1.25);
  });

  it("steps down from fit the same way", () => {
    const next = zoomOut(FIT_STATE);
    expect(next.mode).toBe("custom");
    expect(next.scale).toBeCloseTo(0.8);
  });

  it("compounds from a custom scale", () => {
    const once = zoomIn(FIT_STATE);
    const twice = zoomIn(once);
    expect(twice.scale).toBeCloseTo(1.5625);
  });

  it("never exceeds the maximum scale", () => {
    let state = FIT_STATE;
    for (let i = 0; i < 50; i++) state = zoomIn(state);
    expect(state.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it("never drops below the minimum scale", () => {
    let state = FIT_STATE;
    for (let i = 0; i < 50; i++) state = zoomOut(state);
    expect(state.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });
});

describe("resetZoom / setActualSize", () => {
  it("reset returns to fit", () => {
    expect(resetZoom()).toEqual(FIT_STATE);
  });

  it("actual size is a distinct mode at 1x", () => {
    expect(setActualSize()).toEqual(ACTUAL_SIZE_STATE);
    expect(setActualSize().mode).toBe("actual");
  });
});

describe("canZoomIn / canZoomOut", () => {
  it("disables further zoom in at the ceiling", () => {
    let state = FIT_STATE;
    while (canZoomIn(state)) state = zoomIn(state);
    expect(canZoomIn(state)).toBe(false);
  });

  it("disables further zoom out at the floor", () => {
    let state = FIT_STATE;
    while (canZoomOut(state)) state = zoomOut(state);
    expect(canZoomOut(state)).toBe(false);
  });

  it("both directions are available from a mid-range custom scale", () => {
    const mid = { mode: "custom" as const, scale: 1 };
    expect(canZoomIn(mid)).toBe(true);
    expect(canZoomOut(mid)).toBe(true);
  });
});

describe("zoomPercentLabel", () => {
  it("labels fit mode without a ratio", () => {
    expect(zoomPercentLabel(FIT_STATE, null)).toBe("Fit");
  });

  it("labels fit mode with the actual rendered ratio", () => {
    expect(zoomPercentLabel(FIT_STATE, 0.5)).toBe("Fit (50%)");
  });

  it("labels a custom scale as a percentage", () => {
    expect(zoomPercentLabel({ mode: "custom", scale: 1.5 }, null)).toBe("150%");
  });

  it("labels actual size as 100%", () => {
    expect(zoomPercentLabel(ACTUAL_SIZE_STATE, null)).toBe("100%");
  });
});
