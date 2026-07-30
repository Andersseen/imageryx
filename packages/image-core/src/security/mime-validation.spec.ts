import { describe, expect, it } from "vitest";
import { detectImageSignature, validateImageAsset } from "./mime-validation";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
]);
const GIF_BYTES = new TextEncoder().encode("GIF89a" + "\0".repeat(6));
const WEBP_BYTES = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0x00,
  0x00,
  0x00,
  0x00,
  ...new TextEncoder().encode("WEBP"),
]);
const SVG_BYTES = new TextEncoder().encode(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
);
const RANDOM_BYTES = new Uint8Array([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
]);

describe("detectImageSignature", () => {
  it("detects a PNG signature", () => {
    expect(detectImageSignature(PNG_BYTES).mimeType).toBe("image/png");
  });

  it("detects a JPEG signature", () => {
    expect(detectImageSignature(JPEG_BYTES).mimeType).toBe("image/jpeg");
  });

  it("detects a GIF signature", () => {
    expect(detectImageSignature(GIF_BYTES).mimeType).toBe("image/gif");
  });

  it("detects a WebP signature", () => {
    expect(detectImageSignature(WEBP_BYTES).mimeType).toBe("image/webp");
  });

  it("detects SVG structure and flags it as untrusted", () => {
    const result = detectImageSignature(SVG_BYTES);
    expect(result.mimeType).toBe("image/svg+xml");
    expect(result.warnings).toContain("svg-detected-untrusted-content");
  });

  it("returns null for an unrecognized file", () => {
    expect(detectImageSignature(RANDOM_BYTES).mimeType).toBeNull();
  });
});

describe("validateImageAsset", () => {
  it("validates a PNG whose claim matches its signature", () => {
    const result = validateImageAsset({
      claimedMimeType: "image/png",
      claimedExtension: "png",
      bytes: PNG_BYTES,
    });
    expect(result).toEqual({
      valid: true,
      detectedMimeType: "image/png",
      detectedExtension: "png",
      securityWarnings: [],
    });
  });

  it("rejects an unsupported claimed MIME type", () => {
    const result = validateImageAsset({
      claimedMimeType: "application/pdf",
      claimedExtension: "png",
      bytes: PNG_BYTES,
    });
    expect(result.valid).toBe(false);
    expect(result.securityWarnings).toContain("unsupported-claimed-type");
  });

  it("rejects a claimed extension incompatible with the claimed MIME type", () => {
    const result = validateImageAsset({
      claimedMimeType: "image/png",
      claimedExtension: "gif",
      bytes: PNG_BYTES,
    });
    expect(result.valid).toBe(false);
    expect(result.securityWarnings).toContain("mime-extension-mismatch");
  });

  it("rejects a claimed MIME type that does not match the actual signature (spoofed extension)", () => {
    const result = validateImageAsset({
      claimedMimeType: "image/png",
      claimedExtension: "png",
      bytes: JPEG_BYTES,
    });
    expect(result.valid).toBe(false);
    expect(result.detectedMimeType).toBe("image/jpeg");
    expect(result.securityWarnings).toContain(
      "claimed-mime-does-not-match-signature",
    );
  });

  it("rejects an unrecognized/unsupported byte stream", () => {
    const result = validateImageAsset({
      claimedMimeType: "image/png",
      claimedExtension: "png",
      bytes: RANDOM_BYTES,
    });
    expect(result.valid).toBe(false);
    expect(result.securityWarnings).toContain("unrecognized-signature");
  });

  it("accepts SVG but always flags it as not fully sanitized, even when valid", () => {
    const result = validateImageAsset({
      claimedMimeType: "image/svg+xml",
      claimedExtension: "svg",
      bytes: SVG_BYTES,
    });
    expect(result.valid).toBe(true);
    expect(result.securityWarnings).toContain("svg-detected-untrusted-content");
    expect(result.securityWarnings).toContain("svg-not-fully-sanitized");
  });
});
