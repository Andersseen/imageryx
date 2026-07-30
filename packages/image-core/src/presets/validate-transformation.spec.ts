import type { ImageOperation } from "@imageryx/contracts";
import { describe, expect, it } from "vitest";
import { InvalidPresetError } from "../errors/domain-errors";
import {
  validatePresetSemantics,
  validateTransformationChain,
} from "./validate-transformation";

describe("validateTransformationChain", () => {
  it("accepts a normal operation chain", () => {
    const operations: ImageOperation[] = [
      { type: "resize", width: 320, height: 320, fit: "cover" },
      { type: "quality", value: 80 },
    ];
    expect(() => validateTransformationChain(operations)).not.toThrow();
  });

  it("rejects more than the maximum number of operations", () => {
    const operations: ImageOperation[] = Array.from({ length: 13 }, (_, i) => ({
      type: "rotate",
      degrees: (i % 2 === 0 ? 90 : 180) as 90 | 180,
    }));
    // duplicate types aside, this also exceeds the 12-operation cap
    expect(() => validateTransformationChain(operations)).toThrow(
      InvalidPresetError,
    );
  });

  it("rejects duplicate operation types", () => {
    const operations: ImageOperation[] = [
      { type: "resize", width: 100, fit: "cover" },
      { type: "resize", width: 200, fit: "cover" },
    ];
    expect(() => validateTransformationChain(operations)).toThrow(
      InvalidPresetError,
    );
  });

  it("rejects more than one format operation", () => {
    const operations: ImageOperation[] = [
      { type: "format", format: "webp" },
      { type: "format", format: "jpeg" },
    ];
    expect(() => validateTransformationChain(operations)).toThrow(
      InvalidPresetError,
    );
  });

  it("rejects more than one quality operation", () => {
    const operations: ImageOperation[] = [
      { type: "quality", value: 80 },
      { type: "quality", value: 90 },
    ];
    expect(() => validateTransformationChain(operations)).toThrow(
      InvalidPresetError,
    );
  });

  it("rejects a cover-fit resize missing height", () => {
    const operations: ImageOperation[] = [
      { type: "resize", width: 320, fit: "cover" },
    ];
    expect(() => validateTransformationChain(operations)).toThrow(
      InvalidPresetError,
    );
  });

  it("accepts a scale-down resize with only width", () => {
    const operations: ImageOperation[] = [
      { type: "resize", width: 1280, fit: "scale-down" },
    ];
    expect(() => validateTransformationChain(operations)).not.toThrow();
  });

  it("rejects a crop whose bounds cannot be valid regardless of source size", () => {
    const operations: ImageOperation[] = [
      { type: "crop", x: 20000, y: 0, width: 8192, height: 8192 },
    ];
    expect(() => validateTransformationChain(operations)).toThrow(
      InvalidPresetError,
    );
  });
});

describe("validatePresetSemantics", () => {
  it("rejects a format operation that conflicts with the preset outputFormat", () => {
    expect(() =>
      validatePresetSemantics({
        operations: [{ type: "format", format: "webp" }],
        outputFormat: "jpeg",
        quality: null,
      }),
    ).toThrow(InvalidPresetError);
  });

  it("accepts a format operation that matches the preset outputFormat", () => {
    expect(() =>
      validatePresetSemantics({
        operations: [{ type: "format", format: "webp" }],
        outputFormat: "webp",
        quality: null,
      }),
    ).not.toThrow();
  });

  it("rejects a quality operation that conflicts with the preset quality", () => {
    expect(() =>
      validatePresetSemantics({
        operations: [{ type: "quality", value: 80 }],
        outputFormat: "auto",
        quality: 90,
      }),
    ).toThrow(InvalidPresetError);
  });

  it("accepts an empty operations array (original-delivery policy)", () => {
    expect(() =>
      validatePresetSemantics({
        operations: [],
        outputFormat: "auto",
        quality: null,
      }),
    ).not.toThrow();
  });
});
