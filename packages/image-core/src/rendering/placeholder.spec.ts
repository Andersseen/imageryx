import { describe, expect, it } from "vitest";
import {
  approximateDominantColorFromChecksum,
  buildColorPlaceholderDataUri,
} from "./placeholder";

describe("approximateDominantColorFromChecksum", () => {
  it("derives a 6-digit lowercase hex color deterministically from a checksum", () => {
    const checksum = "a".repeat(64);
    expect(approximateDominantColorFromChecksum(checksum)).toBe("#aaaaaa");
  });

  it("is deterministic for the same checksum", () => {
    const checksum = "0123456789abcdef".repeat(4);
    expect(approximateDominantColorFromChecksum(checksum)).toBe(
      approximateDominantColorFromChecksum(checksum),
    );
  });
});

describe("buildColorPlaceholderDataUri", () => {
  it("produces a base64-encoded SVG data URI", () => {
    const uri = buildColorPlaceholderDataUri("#aaaaaa");
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const decoded = atob(uri.split(",")[1] ?? "");
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("#aaaaaa");
  });
});
