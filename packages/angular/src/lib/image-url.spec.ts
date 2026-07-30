import { describe, expect, it } from "vitest";
import {
  resolveAspectRatio,
  resolveBackgroundStyle,
  resolveImageSrc,
  resolveSrcset,
} from "./image-url";

describe("resolveImageSrc", () => {
  it("builds the original delivery URL when no preset is given", () => {
    expect(resolveImageSrc("http://localhost:8788", "angular-lab", "courses/signals/hero")).toBe(
      "http://localhost:8788/angular-lab/assets/courses/signals/hero",
    );
  });

  it("builds a preset delivery URL when a preset is given", () => {
    expect(
      resolveImageSrc("http://localhost:8788", "angular-lab", "courses/signals/hero", "hero"),
    ).toBe("http://localhost:8788/angular-lab/assets/courses/signals/hero/p/hero");
  });
});

describe("resolveSrcset", () => {
  it("returns an empty string when no responsive presets are given", () => {
    expect(resolveSrcset("http://localhost:8788", "p", "a", undefined)).toBe("");
    expect(resolveSrcset("http://localhost:8788", "p", "a", [])).toBe("");
  });

  it("builds a width-descriptor srcset from preset/width pairs", () => {
    const srcset = resolveSrcset("http://localhost:8788", "angular-lab", "courses/signals/hero", [
      { preset: "content-sm", width: 480 },
      { preset: "content-md", width: 768 },
      { preset: "hero", width: 1920 },
    ]);
    expect(srcset).toBe(
      "http://localhost:8788/angular-lab/assets/courses/signals/hero/p/content-sm 480w, " +
        "http://localhost:8788/angular-lab/assets/courses/signals/hero/p/content-md 768w, " +
        "http://localhost:8788/angular-lab/assets/courses/signals/hero/p/hero 1920w",
    );
  });
});

describe("resolveBackgroundStyle", () => {
  it("returns null when no placeholder is given", () => {
    expect(resolveBackgroundStyle(undefined)).toBeNull();
    expect(resolveBackgroundStyle(null)).toBeNull();
  });

  it("passes a plain CSS color through unchanged", () => {
    expect(resolveBackgroundStyle("#e2e8f0")).toBe("#e2e8f0");
  });

  it("wraps a data: URI as a background-image", () => {
    expect(resolveBackgroundStyle("data:image/svg+xml;base64,AAAA")).toBe(
      'center / cover no-repeat url("data:image/svg+xml;base64,AAAA")',
    );
  });

  it("wraps an http(s) URL as a background-image", () => {
    expect(resolveBackgroundStyle("https://example.com/p.png")).toBe(
      'center / cover no-repeat url("https://example.com/p.png")',
    );
  });
});

describe("resolveAspectRatio", () => {
  it("returns the CSS aspect-ratio value when both dimensions are given", () => {
    expect(resolveAspectRatio(1920, 1080)).toBe("1920 / 1080");
  });

  it("returns null when either dimension is missing", () => {
    expect(resolveAspectRatio(1920, undefined)).toBeNull();
    expect(resolveAspectRatio(undefined, 1080)).toBeNull();
    expect(resolveAspectRatio(undefined, undefined)).toBeNull();
  });
});
