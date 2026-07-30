import { UnsupportedOperationError } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";
import {
  buildCloudinaryPublicId,
  buildCloudinarySignatureBase,
  mapOperationsToCloudinaryOptions,
  signCloudinaryParams,
} from "./cloudinary.provider";

describe("mapOperationsToCloudinaryOptions — resize and crop", () => {
  it("maps a resize with fit and gravity", () => {
    const options = mapOperationsToCloudinaryOptions(
      [
        {
          type: "resize",
          width: 320,
          height: 240,
          fit: "cover",
          position: "bottom-right",
        },
      ],
      "auto",
      null,
    );
    expect(options).toMatchObject({
      width: 320,
      height: 240,
      crop: "fill",
      gravity: "south_east",
    });
  });

  it("maps a manual pixel crop to c_crop with x/y offsets", () => {
    const options = mapOperationsToCloudinaryOptions(
      [{ type: "crop", x: 10, y: 20, width: 100, height: 100 }],
      "auto",
      null,
    );
    expect(options).toMatchObject({
      crop: "crop",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
    });
  });
});

describe("mapOperationsToCloudinaryOptions — quality and output format", () => {
  it("maps a non-auto output format to Cloudinary's abbreviation (jpeg -> jpg)", () => {
    const options = mapOperationsToCloudinaryOptions([], "jpeg", null);
    expect(options.format).toBe("jpg");
  });

  it('maps "auto" output format to Cloudinary\'s f_auto', () => {
    const options = mapOperationsToCloudinaryOptions([], "auto", null);
    expect(options.format).toBe("auto");
  });

  it("maps preset-level quality", () => {
    const options = mapOperationsToCloudinaryOptions([], "auto", 82);
    expect(options.quality).toBe(82);
  });
});

describe("mapOperationsToCloudinaryOptions — metadata stripping", () => {
  it("maps a plain strip mode to the strip_profile flag", () => {
    const options = mapOperationsToCloudinaryOptions(
      [{ type: "metadata", mode: "strip" }],
      "auto",
      null,
    );
    expect(options.flags).toContain("strip_profile");
  });

  it("rejects a strip-location metadata mode (no documented GPS-only flag)", () => {
    expect(() =>
      mapOperationsToCloudinaryOptions(
        [{ type: "metadata", mode: "strip-location" }],
        "auto",
        null,
      ),
    ).toThrow(UnsupportedOperationError);
  });

  it("keep mode adds no flags", () => {
    const options = mapOperationsToCloudinaryOptions(
      [{ type: "metadata", mode: "keep" }],
      "auto",
      null,
    );
    expect(options.flags).toEqual([]);
  });
});

describe("mapOperationsToCloudinaryOptions — operations Cloudflare cannot do", () => {
  it('supports grayscale (an "advanced" operation Cloudflare mapping rejects)', () => {
    const options = mapOperationsToCloudinaryOptions(
      [{ type: "grayscale", enabled: true }],
      "auto",
      null,
    );
    expect(options.effects).toContain("grayscale");
  });

  it('supports a manual pixel crop (an "advanced" operation Cloudflare mapping rejects)', () => {
    const options = mapOperationsToCloudinaryOptions(
      [{ type: "crop", x: 0, y: 0, width: 50, height: 50 }],
      "auto",
      null,
    );
    expect(options.crop).toBe("crop");
  });
});

describe("buildCloudinaryPublicId", () => {
  it("builds an opaque, project-namespaced identifier", () => {
    expect(buildCloudinaryPublicId("asset-123", "hash-abc")).toBe(
      "imageryx/asset-123/hash-abc",
    );
  });

  it("rejects identifiers containing path separators", () => {
    expect(() => buildCloudinaryPublicId("../escape", "hash")).toThrow();
  });
});

describe("Cloudinary signing", () => {
  it("excludes file/cloud_name/resource_type/api_key/signature from the signature base", () => {
    const base = buildCloudinarySignatureBase({
      public_id: "imageryx/a/b",
      timestamp: 123,
      file: "should-be-excluded",
      api_key: "should-be-excluded",
    });
    expect(base).toBe("public_id=imageryx/a/b&timestamp=123");
  });

  it("sorts parameters alphabetically regardless of insertion order", () => {
    const base = buildCloudinarySignatureBase({ timestamp: 1, public_id: "x" });
    expect(base).toBe("public_id=x&timestamp=1");
  });

  it("produces a deterministic, non-empty hex signature and never echoes the secret", async () => {
    const signature = await signCloudinaryParams({
      params: { public_id: "x", timestamp: 1 },
      apiSecret: "top-secret",
    });
    expect(signature).toMatch(/^[a-f0-9]{40}$/);
    expect(signature).not.toContain("top-secret");
  });

  it("produces a different signature for a different secret", async () => {
    const a = await signCloudinaryParams({
      params: { public_id: "x" },
      apiSecret: "secret-a",
    });
    const b = await signCloudinaryParams({
      params: { public_id: "x" },
      apiSecret: "secret-b",
    });
    expect(a).not.toBe(b);
  });
});
