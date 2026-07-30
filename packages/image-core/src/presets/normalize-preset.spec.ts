import type { ImageOperation } from "@imageryx/contracts";
import { describe, expect, it } from "vitest";
import { canonicalPresetJson, normalizePreset } from "./normalize-preset";

describe("normalizePreset", () => {
  it("drops undefined optional fields and a false withoutEnlargement so equivalent definitions match", () => {
    const withOmittedField = normalizePreset({
      operations: [{ type: "resize", width: 320, fit: "cover" }],
      outputFormat: "auto",
    });
    const withExplicitFalse = normalizePreset({
      operations: [
        { type: "resize", width: 320, fit: "cover", withoutEnlargement: false },
      ],
      outputFormat: "auto",
      quality: null,
    });
    expect(canonicalPresetJson(withOmittedField)).toBe(
      canonicalPresetJson(withExplicitFalse),
    );
  });

  it("lowercases and expands shorthand hex colors", () => {
    const shorthand = normalizePreset({
      operations: [{ type: "background", color: "#FFF" }],
      outputFormat: "auto",
    });
    const longform = normalizePreset({
      operations: [{ type: "background", color: "#ffffff" }],
      outputFormat: "auto",
    });
    expect(canonicalPresetJson(shorthand)).toBe(canonicalPresetJson(longform));
  });

  it("preserves operation order", () => {
    const operations: ImageOperation[] = [
      { type: "rotate", degrees: 90 },
      { type: "grayscale", enabled: true },
    ];
    const result = normalizePreset({ operations, outputFormat: "auto" });
    expect(result.operations.map((op) => op.type)).toEqual([
      "rotate",
      "grayscale",
    ]);
  });

  it("defaults quality to null when omitted", () => {
    const result = normalizePreset({ operations: [], outputFormat: "auto" });
    expect(result.quality).toBeNull();
  });
});

describe("canonicalPresetJson", () => {
  it("is stable regardless of source object key order", () => {
    const a = { operations: [], outputFormat: "auto" as const, quality: null };
    const b = { quality: null, outputFormat: "auto" as const, operations: [] };
    expect(canonicalPresetJson(a)).toBe(canonicalPresetJson(b));
  });
});
