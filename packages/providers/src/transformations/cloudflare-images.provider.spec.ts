import type { ImageOperation } from "@imageryx/contracts";
import { UnsupportedOperationError } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";
import {
  mapCloudflareBlurValue,
  mapCloudflareSharpenValue,
  mapOperationsToCloudflareOptions,
} from "./cloudflare-images.provider";

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
    expect(options).toMatchObject({
      width: 320,
      height: 240,
      fit: "cover",
      gravity: { x: 0, y: 0 },
    });
  });

  it("maps a cardinal position to a gravity keyword", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "resize", width: 100, fit: "contain", position: "top" }],
      "auto",
      null,
    );
    expect(options.gravity).toBe("top");
  });
});

describe("mapOperationsToCloudflareOptions — format and quality", () => {
  it("maps a non-auto output format", () => {
    const options = mapOperationsToCloudflareOptions([], "webp", null);
    expect(options.format).toBe("webp");
  });

  it('omits format for "auto"', () => {
    const options = mapOperationsToCloudflareOptions([], "auto", null);
    expect(options.format).toBeUndefined();
  });

  it("maps preset-level quality when no quality operation is present", () => {
    const options = mapOperationsToCloudflareOptions([], "auto", 82);
    expect(options.quality).toBe(82);
  });

  it("a quality operation takes precedence over the preset-level value", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "quality", value: 55 }],
      "auto",
      82,
    );
    expect(options.quality).toBe(55);
  });
});

describe("mapOperationsToCloudflareOptions — background, blur, sharpen", () => {
  it("passes a normalized background color through unchanged", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "background", color: "#ffffff" }],
      "auto",
      null,
    );
    expect(options.background).toBe("#ffffff");
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

  it("rejects a strip-location metadata mode (Cloudflare has no GPS-only strip)", () => {
    expect(() =>
      mapOperationsToCloudflareOptions(
        [{ type: "metadata", mode: "strip-location" }],
        "auto",
        null,
      ),
    ).toThrow(UnsupportedOperationError);
  });

  it('maps a plain strip metadata mode to "none"', () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "metadata", mode: "strip" }],
      "auto",
      null,
    );
    expect(options.metadata).toBe("none");
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
    expect(options.rotate).toBe(90);
    expect(options.flip).toBe("hv");
  });

  it("does not forward arbitrary/unmapped fields — output is only the declared option shape", () => {
    const options = mapOperationsToCloudflareOptions(
      [{ type: "resize", width: 100, fit: "cover" }],
      "auto",
      null,
    );
    expect(Object.keys(options).sort()).toEqual(["fit", "width"]);
  });
});
