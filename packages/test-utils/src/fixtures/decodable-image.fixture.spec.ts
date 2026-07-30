import { inspectImageDimensions, validateImageAsset } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";
import { createDecodableImageFixture } from "./decodable-image.fixture";

const FORMATS = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

describe("createDecodableImageFixture", () => {
  it.each(FORMATS)("passes real MIME/signature validation for %s", (mimeType) => {
    const fixture = createDecodableImageFixture(mimeType);
    const extension = fixture.filename.split(".").pop() as string;
    const result = validateImageAsset({
      claimedMimeType: mimeType,
      claimedExtension: extension,
      bytes: fixture.bytes,
    });
    expect(result.valid).toBe(true);
    expect(result.detectedMimeType).toBe(mimeType);
  });

  it.each(FORMATS)("reports its real declared dimensions for %s", (mimeType) => {
    const fixture = createDecodableImageFixture(mimeType);
    const dimensions = inspectImageDimensions(mimeType, fixture.bytes);
    expect(dimensions.width).toBe(fixture.width);
    expect(dimensions.height).toBe(fixture.height);
    expect(dimensions.hasAlpha).toBe(fixture.hasAlpha);
  });

  it("produces a valid AVIF signature with no dimension claim", () => {
    const fixture = createDecodableImageFixture("image/avif");
    const result = validateImageAsset({
      claimedMimeType: "image/avif",
      claimedExtension: "avif",
      bytes: fixture.bytes,
    });
    expect(result.valid).toBe(true);
  });
});
