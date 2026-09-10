import type { ImagesBinding } from "@cloudflare/workers-types";
import type { ImageOperation } from "@imageryx/contracts";
import {
  ProviderUnavailableError,
  UnsupportedOperationError,
} from "@imageryx/image-core";
import { describe, expect, it, vi } from "vitest";
import {
  CloudflareImagesProvider,
  mapCloudflareBlurValue,
  mapCloudflareSharpenValue,
  mapOperationsToCloudflareOptions,
} from "./cloudflare-images.provider";
import type { TransformationInput } from "./transformation-provider";

describe("mapOperationsToCloudflareOptions — resize", () => {
  it("maps width, height, fit, and gravity", () => {
    const options = mapOperationsToCloudflareOptions(
      [
        {
          type: "resize",
          width: 320,
          height: 240,
          fit: "cover",
          position: "top-left",
        },
      ],
      "auto",
      null,
    );
    expect(options.transform).toMatchObject({
      width: 320,
      height: 240,
      fit: "cover",
      gravity: { x: 0, y: 0, mode: "box-center" },
    });
  });

  it("maps a cardinal position to a gravity keyword", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "resize", width: 100, fit: "contain", position: "top" }],
      "auto",
      null,
    );
    expect(options.transform.gravity).toBe("top");
  });
});

describe("mapOperationsToCloudflareOptions — format and quality", () => {
  it("maps a non-auto output format to its MIME type", () => {
    const options = mapOperationsToCloudflareOptions([], "webp", null);
    expect(options.output.format).toBe("image/webp");
  });

  it('resolves "auto" to the default autoFormat (webp)', () => {
    const options = mapOperationsToCloudflareOptions([], "auto", null);
    expect(options.output.format).toBe("image/webp");
  });

  it('resolves "auto" to a caller-supplied autoFormat', () => {
    const options = mapOperationsToCloudflareOptions([], "auto", null, "avif");
    expect(options.output.format).toBe("image/avif");
  });

  it("maps preset-level quality when no quality operation is present", () => {
    const options = mapOperationsToCloudflareOptions([], "auto", 82);
    expect(options.output.quality).toBe(82);
  });

  it("a quality operation must already match the preset-level value (enforced upstream by validatePresetSemantics)", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "quality", value: 55 }],
      "auto",
      55,
    );
    expect(options.output.quality).toBe(55);
  });

  it('rejects outputFormat "svg" — Cloudflare Images never produces vector output', () => {
    expect(() => mapOperationsToCloudflareOptions([], "svg", null)).toThrow(
      UnsupportedOperationError,
    );
  });
});

describe("mapOperationsToCloudflareOptions — background, blur, sharpen", () => {
  it("passes a normalized background color through to both transform and output", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "background", color: "#ffffff" }],
      "auto",
      null,
    );
    expect(options.transform.background).toBe("#ffffff");
    expect(options.output.background).toBe("#ffffff");
  });

  it("maps the domain 0-100 blur range onto Cloudflare's documented 1-250 range", () => {
    expect(mapCloudflareBlurValue(0)).toBe(1);
    expect(mapCloudflareBlurValue(100)).toBe(250);
  });

  it("maps the domain 0-100 sharpen range onto Cloudflare's documented ~0-10 range", () => {
    expect(mapCloudflareSharpenValue(0)).toBe(0);
    expect(mapCloudflareSharpenValue(100)).toBe(10);
  });
});

describe("mapOperationsToCloudflareOptions — invalid combinations and unsupported operations", () => {
  it("rejects a crop operation (no pixel-offset crop in Cloudflare's standard API)", () => {
    expect(() =>
      mapOperationsToCloudflareOptions(
        [{ type: "crop", x: 0, y: 0, width: 10, height: 10 }],
        "auto",
        null,
      ),
    ).toThrow(UnsupportedOperationError);
  });

  it("rejects a grayscale operation (not a documented Cloudflare Images parameter)", () => {
    expect(() =>
      mapOperationsToCloudflareOptions(
        [{ type: "grayscale", enabled: true }],
        "auto",
        null,
      ),
    ).toThrow(UnsupportedOperationError);
  });

  it("rejects any metadata operation — confirmed against the real ImageTransform/ImageOutputOptions types that the Images binding has no metadata/EXIF control at all", () => {
    expect(() =>
      mapOperationsToCloudflareOptions(
        [{ type: "metadata", mode: "strip" }],
        "auto",
        null,
      ),
    ).toThrow(UnsupportedOperationError);
    expect(() =>
      mapOperationsToCloudflareOptions(
        [{ type: "metadata", mode: "strip-location" }],
        "auto",
        null,
      ),
    ).toThrow(UnsupportedOperationError);
  });

  it("maps rotate and flip", () => {
    const options = mapOperationsToCloudflareOptions(
      [
        { type: "rotate", degrees: 90 },
        { type: "flip", horizontal: true, vertical: true },
      ] satisfies ImageOperation[],
      "auto",
      null,
    );
    expect(options.transform.rotate).toBe(90);
    expect(options.transform.flip).toBe("hv");
  });

  it("does not forward arbitrary/unmapped fields to the transform — output is only the declared option shape", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "resize", width: 100, fit: "cover" }],
      "auto",
      null,
    );
    expect(Object.keys(options.transform).sort()).toEqual(["fit", "width"]);
  });
});

function baseInput(
  overrides: Partial<TransformationInput> = {},
): TransformationInput {
  return {
    assetId: "asset-1",
    assetSlug: "cover-image",
    sourceBytes: new Uint8Array([1, 2, 3, 4]),
    sourceWidth: 800,
    sourceHeight: 600,
    sourceMimeType: "image/png",
    operations: [{ type: "resize", width: 400, fit: "scale-down" }],
    outputFormat: "webp",
    quality: 80,
    presetHash: "hash123",
    ...overrides,
  };
}

function fakeImagesBinding(outputBytes: Uint8Array): ImagesBinding {
  const transformer = {
    transform: vi.fn().mockReturnThis(),
    draw: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnValue({
      response: () =>
        new Response(outputBytes, {
          headers: { "content-type": "image/webp" },
        }),
      contentType: () => "image/webp",
      image: () => new Blob([outputBytes]).stream(),
    }),
  };
  return {
    input: vi.fn().mockReturnValue(transformer),
    info: vi.fn().mockResolvedValue({
      format: "image/webp",
      fileSize: outputBytes.byteLength,
      width: 400,
      height: 300,
    }),
  } as unknown as ImagesBinding;
}

describe("CloudflareImagesProvider.transform", () => {
  it("throws ProviderUnavailableError when constructed without the IMAGES binding", async () => {
    const provider = new CloudflareImagesProvider();
    await expect(provider.transform(baseInput())).rejects.toThrow(
      ProviderUnavailableError,
    );
  });

  it("calls input().transform().output(), returning real bytes, checksum, and dimensions from info()", async () => {
    const outputBytes = new Uint8Array([9, 9, 9, 9, 9]);
    const images = fakeImagesBinding(outputBytes);
    const provider = new CloudflareImagesProvider({ images });

    const result = await provider.transform(baseInput());

    expect(images.input).toHaveBeenCalledOnce();
    expect(result.simulated).toBe(false);
    expect(result.bytes).toEqual(outputBytes);
    expect(result.sizeBytes).toBe(outputBytes.byteLength);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.mimeType).toBe("image/webp");
    expect(result.checksum).toHaveLength(64);
  });

  it("still returns a result if the follow-up info() dimension lookup fails", async () => {
    const outputBytes = new Uint8Array([1, 1, 1]);
    const images = fakeImagesBinding(outputBytes);
    (images.info as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("info unavailable"),
    );
    const provider = new CloudflareImagesProvider({ images });

    const result = await provider.transform(baseInput());

    expect(result.simulated).toBe(false);
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
  });

  it("rejects when called without source bytes", async () => {
    const images = fakeImagesBinding(new Uint8Array());
    const provider = new CloudflareImagesProvider({ images });
    await expect(
      provider.transform(baseInput({ sourceBytes: undefined })),
    ).rejects.toThrow(ProviderUnavailableError);
  });
});
