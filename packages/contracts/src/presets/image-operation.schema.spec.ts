import { describe, expect, it } from "vitest";
import { imageOperationSchema } from "./image-operation.schema";

describe("imageOperationSchema — resize", () => {
  it("accepts a resize with width only", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "resize",
        width: 320,
        fit: "cover",
      }).success,
    ).toBe(true);
  });

  it("rejects a resize with neither width nor height", () => {
    expect(
      imageOperationSchema.safeParse({ type: "resize", fit: "cover" }).success,
    ).toBe(false);
  });

  it("rejects a resize dimension above the maximum", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "resize",
        width: 8193,
        fit: "cover",
      }).success,
    ).toBe(false);
  });

  it("rejects a resize dimension below the minimum", () => {
    expect(
      imageOperationSchema.safeParse({ type: "resize", width: 0, fit: "cover" })
        .success,
    ).toBe(false);
  });

  it("rejects an invalid fit value", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "resize",
        width: 100,
        fit: "squeeze",
      }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — crop", () => {
  it("accepts a bounded crop", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "crop",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }).success,
    ).toBe(true);
  });

  it("rejects a negative offset", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "crop",
        x: -1,
        y: 0,
        width: 100,
        height: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects a zero-size crop", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "crop",
        x: 0,
        y: 0,
        width: 0,
        height: 100,
      }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — rotate", () => {
  it.each([0, 90, 180, 270])("accepts %i degrees", (degrees) => {
    expect(
      imageOperationSchema.safeParse({ type: "rotate", degrees }).success,
    ).toBe(true);
  });

  it("rejects a non-normalized rotation", () => {
    expect(
      imageOperationSchema.safeParse({ type: "rotate", degrees: 45 }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — flip", () => {
  it("accepts a flip with one direction enabled", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "flip",
        horizontal: true,
        vertical: false,
      }).success,
    ).toBe(true);
  });

  it("rejects a flip with neither direction enabled", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "flip",
        horizontal: false,
        vertical: false,
      }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — format", () => {
  it.each(["auto", "avif", "webp", "jpeg", "png"])("accepts %s", (format) => {
    expect(
      imageOperationSchema.safeParse({ type: "format", format }).success,
    ).toBe(true);
  });

  it("rejects svg as an output format", () => {
    expect(
      imageOperationSchema.safeParse({ type: "format", format: "svg" }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — quality", () => {
  it("accepts the boundary values 1 and 100", () => {
    expect(
      imageOperationSchema.safeParse({ type: "quality", value: 1 }).success,
    ).toBe(true);
    expect(
      imageOperationSchema.safeParse({ type: "quality", value: 100 }).success,
    ).toBe(true);
  });

  it("rejects a value outside 1-100", () => {
    expect(
      imageOperationSchema.safeParse({ type: "quality", value: 0 }).success,
    ).toBe(false);
    expect(
      imageOperationSchema.safeParse({ type: "quality", value: 101 }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — background", () => {
  it("accepts a 6-digit hex color", () => {
    expect(
      imageOperationSchema.safeParse({ type: "background", color: "#ffffff" })
        .success,
    ).toBe(true);
  });

  it("accepts the literal transparent value", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "background",
        color: "transparent",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid color string", () => {
    expect(
      imageOperationSchema.safeParse({
        type: "background",
        color: "not-a-color",
      }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — blur and sharpen", () => {
  it("accepts bounded blur and sharpen values", () => {
    expect(
      imageOperationSchema.safeParse({ type: "blur", value: 50 }).success,
    ).toBe(true);
    expect(
      imageOperationSchema.safeParse({ type: "sharpen", value: 50 }).success,
    ).toBe(true);
  });

  it("rejects out-of-range blur and sharpen values", () => {
    expect(
      imageOperationSchema.safeParse({ type: "blur", value: 101 }).success,
    ).toBe(false);
    expect(
      imageOperationSchema.safeParse({ type: "sharpen", value: -1 }).success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — grayscale", () => {
  it("accepts an enabled grayscale operation", () => {
    expect(
      imageOperationSchema.safeParse({ type: "grayscale", enabled: true })
        .success,
    ).toBe(true);
  });

  it("rejects a grayscale operation with enabled: false", () => {
    expect(
      imageOperationSchema.safeParse({ type: "grayscale", enabled: false })
        .success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — metadata", () => {
  it.each(["keep", "strip", "strip-location"])("accepts mode %s", (mode) => {
    expect(
      imageOperationSchema.safeParse({ type: "metadata", mode }).success,
    ).toBe(true);
  });

  it("rejects an unsupported mode", () => {
    expect(
      imageOperationSchema.safeParse({ type: "metadata", mode: "anonymize" })
        .success,
    ).toBe(false);
  });
});

describe("imageOperationSchema — unknown operation type", () => {
  it("rejects an operation type outside the union", () => {
    expect(imageOperationSchema.safeParse({ type: "watermark" }).success).toBe(
      false,
    );
  });
});
