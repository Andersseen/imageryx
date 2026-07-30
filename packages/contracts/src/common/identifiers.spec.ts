import { describe, expect, it } from "vitest";
import {
  EXTENSION_TO_MIME_TYPE,
  MIME_TYPE_TO_EXTENSIONS,
  checksumSchema,
  logicalPathSchema,
  slugSchema,
  supportedImageExtensionSchema,
  supportedImageMimeTypeSchema,
  uuidSchema,
} from "./identifiers";

describe("uuidSchema", () => {
  it("accepts a valid v4 UUID", () => {
    expect(
      uuidSchema.safeParse("123e4567-e89b-42d3-a456-426614174000").success,
    ).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("slugSchema", () => {
  it.each(["project", "angular-lab", "a-b-c-123"])("accepts %s", (value) => {
    expect(slugSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["uppercase", "Angular-Lab"],
    ["leading hyphen", "-angular-lab"],
    ["trailing hyphen", "angular-lab-"],
    ["double hyphen", "angular--lab"],
    ["spaces", "angular lab"],
    ["empty string", ""],
  ])("rejects %s (%s)", (_label, value) => {
    expect(slugSchema.safeParse(value).success).toBe(false);
  });
});

describe("logicalPathSchema", () => {
  it.each(["profile/andrii", "projects/angular-lab/cover", ""])(
    "accepts %s",
    (value) => {
      expect(logicalPathSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ["leading slash", "/profile"],
    ["trailing slash", "profile/"],
    ["repeated separators", "profile//andrii"],
    ["dot segment", "profile/./andrii"],
    ["traversal segment", "profile/../secret"],
    ["backslash", "profile\\andrii"],
    ["null byte", "profile\0andrii"],
  ])("rejects %s (%s)", (_label, value) => {
    expect(logicalPathSchema.safeParse(value).success).toBe(false);
  });
});

describe("checksumSchema", () => {
  it("accepts a 64-char lowercase hex string", () => {
    expect(checksumSchema.safeParse("a".repeat(64)).success).toBe(true);
  });

  it.each(["A".repeat(64), "a".repeat(63), "zz" + "a".repeat(62)])(
    "rejects %s",
    (value) => {
      expect(checksumSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("supported MIME types and extensions", () => {
  it("accepts every documented MIME type and extension", () => {
    for (const mimeType of Object.keys(MIME_TYPE_TO_EXTENSIONS)) {
      expect(supportedImageMimeTypeSchema.safeParse(mimeType).success).toBe(
        true,
      );
    }
    for (const extension of Object.keys(EXTENSION_TO_MIME_TYPE)) {
      expect(supportedImageExtensionSchema.safeParse(extension).success).toBe(
        true,
      );
    }
  });

  it("rejects an unsupported MIME type", () => {
    expect(supportedImageMimeTypeSchema.safeParse("image/bmp").success).toBe(
      false,
    );
  });

  it("maps every extension back to a MIME type present in MIME_TYPE_TO_EXTENSIONS", () => {
    for (const [extension, mimeType] of Object.entries(
      EXTENSION_TO_MIME_TYPE,
    )) {
      expect(MIME_TYPE_TO_EXTENSIONS[mimeType]).toContain(extension);
    }
  });

  it("maps jpeg MIME type to both jpg and jpeg extensions", () => {
    expect(MIME_TYPE_TO_EXTENSIONS["image/jpeg"]).toEqual(["jpg", "jpeg"]);
  });
});
