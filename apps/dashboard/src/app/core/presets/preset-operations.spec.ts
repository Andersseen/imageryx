import type { ImageOperation } from "@imageryx/contracts";
import { describe, expect, it } from "vitest";
import {
  buildPresetOperations,
  DEFAULT_PRESET_FORM_OPERATIONS,
  parsePresetOperations,
  summarizeOperations,
  summarizePresetOutput,
} from "./preset-operations";

describe("buildPresetOperations", () => {
  it("includes resize when enabled with at least one dimension", () => {
    const ops = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      width: 320,
      height: null,
    });
    expect(ops).toEqual([
      {
        type: "resize",
        width: 320,
        height: undefined,
        fit: "cover",
        position: undefined,
        withoutEnlargement: true,
      },
    ]);
  });

  it("omits resize when neither dimension is set, even if enabled", () => {
    const ops = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      width: null,
      height: null,
    });
    expect(ops.find((o) => o.type === "resize")).toBeUndefined();
  });

  it("omits resize entirely when disabled", () => {
    const ops = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      resizeEnabled: false,
    });
    expect(ops.find((o) => o.type === "resize")).toBeUndefined();
  });

  it("includes crop only when enabled", () => {
    const disabled = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      cropEnabled: false,
    });
    expect(disabled.find((o) => o.type === "crop")).toBeUndefined();

    const enabled = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      resizeEnabled: false,
      cropEnabled: true,
      cropX: 10,
      cropY: 20,
      cropWidth: 100,
      cropHeight: 200,
    });
    expect(enabled).toEqual([
      { type: "crop", x: 10, y: 20, width: 100, height: 200 },
    ]);
  });

  it("includes flip only when at least one direction is set", () => {
    const none = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      resizeEnabled: false,
      flipHorizontal: false,
      flipVertical: false,
    });
    expect(none).toHaveLength(0);

    const horizontal = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      resizeEnabled: false,
      flipHorizontal: true,
    });
    expect(horizontal).toEqual([
      { type: "flip", horizontal: true, vertical: false },
    ]);
  });

  it("includes metadata only when the mode is not the default 'keep'", () => {
    const kept = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      resizeEnabled: false,
      metadataMode: "keep",
    });
    expect(kept).toHaveLength(0);

    const stripped = buildPresetOperations({
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      resizeEnabled: false,
      metadataMode: "strip",
    });
    expect(stripped).toEqual([{ type: "metadata", mode: "strip" }]);
  });

  it("assembles a full chain in the same fixed order every time", () => {
    const form = {
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      cropEnabled: true,
      rotateEnabled: true,
      flipHorizontal: true,
      grayscaleEnabled: true,
      blurEnabled: true,
      sharpenEnabled: true,
      backgroundEnabled: true,
      metadataMode: "strip" as const,
    };
    const first = buildPresetOperations(form).map((o) => o.type);
    const second = buildPresetOperations(form).map((o) => o.type);
    expect(first).toEqual(second);
    expect(first).toEqual([
      "resize",
      "crop",
      "rotate",
      "flip",
      "grayscale",
      "blur",
      "sharpen",
      "background",
      "metadata",
    ]);
  });

  it("never exceeds one operation of any given type", () => {
    const form = {
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      cropEnabled: true,
      rotateEnabled: true,
      blurEnabled: true,
    };
    const ops = buildPresetOperations(form);
    const types = ops.map((o) => o.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("parsePresetOperations", () => {
  it("round-trips a full operation chain back to form state", () => {
    const form = {
      ...DEFAULT_PRESET_FORM_OPERATIONS,
      width: 640,
      height: 480,
      cropEnabled: true,
      cropX: 1,
      cropY: 2,
      cropWidth: 3,
      cropHeight: 4,
      rotateEnabled: true,
      rotateDegrees: 180 as const,
      flipHorizontal: true,
      grayscaleEnabled: true,
      blurEnabled: true,
      blurValue: 40,
      sharpenEnabled: true,
      sharpenValue: 60,
      backgroundEnabled: true,
      backgroundColor: "#ff0000",
      metadataMode: "strip-location" as const,
    };
    const operations = buildPresetOperations(form);
    const parsed = parsePresetOperations(operations);
    expect(parsed).toEqual(form);
  });

  it("leaves resize disabled when no resize operation is present", () => {
    const parsed = parsePresetOperations([
      { type: "grayscale", enabled: true },
    ]);
    expect(parsed.resizeEnabled).toBe(false);
    expect(parsed.grayscaleEnabled).toBe(true);
  });

  it("ignores format/quality operations, which this editor never produces", () => {
    const operations: ImageOperation[] = [
      { type: "format", format: "webp" },
      { type: "quality", value: 80 },
    ];
    expect(() => parsePresetOperations(operations)).not.toThrow();
  });

  it("returns the all-defaults-off form for an empty operation list", () => {
    const parsed = parsePresetOperations([]);
    expect(parsed.resizeEnabled).toBe(false);
    expect(parsed.cropEnabled).toBe(false);
    expect(parsed.metadataMode).toBe("keep");
  });
});

describe("summarizeOperations", () => {
  it("summarizes an empty chain honestly", () => {
    expect(summarizeOperations([])).toBe("No operations");
  });

  it("describes a resize operation with its dimensions and fit", () => {
    expect(
      summarizeOperations([
        { type: "resize", width: 320, height: 240, fit: "cover" },
      ]),
    ).toBe("Resize to 320×240 (cover)");
  });

  it("joins multiple operations into one readable line", () => {
    const summary = summarizeOperations([
      { type: "resize", width: 320, fit: "cover" },
      { type: "grayscale", enabled: true },
    ]);
    expect(summary).toContain("Resize to 320");
    expect(summary).toContain("Grayscale");
  });
});

describe("summarizePresetOutput", () => {
  it("includes quality when set", () => {
    expect(summarizePresetOutput("webp", 80)).toBe("webp · quality 80");
  });

  it("omits quality when null", () => {
    expect(summarizePresetOutput("auto", null)).toBe("auto");
  });
});
