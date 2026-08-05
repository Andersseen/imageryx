import { UnsupportedOperationError } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";
import {
  CloudinaryProvider,
  buildCloudinaryPublicId,
  buildCloudinarySignatureBase,
  mapOperationsToCloudinaryOptions,
  signCloudinaryParams,
} from "./cloudinary.provider";

const CREDS = {
  cloudName: "demo",
  apiKey: "api-key-123",
  apiSecret: "api-secret-456",
};

function makeProvider(
  fetchImpl: typeof fetch,
  credentials = CREDS,
): CloudinaryProvider {
  return new CloudinaryProvider({ ...credentials, fetch: fetchImpl });
}

function baseInput(
  overrides: Partial<Parameters<CloudinaryProvider["transform"]>[0]> = {},
) {
  return {
    assetId: "asset-1",
    assetSlug: "hero-banner",
    sourceWidth: 1600,
    sourceHeight: 1200,
    sourceMimeType: "image/png",
    sourceBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    operations: [
      {
        type: "resize" as const,
        width: 320,
        height: 240,
        fit: "cover" as const,
        position: "bottom-right" as const,
      },
    ],
    outputFormat: "jpeg" as const,
    quality: 82,
    presetHash: "hash-abc",
    ...overrides,
  };
}

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

describe("CloudinaryProvider", () => {
  it("throws a clear error when credentials are missing", async () => {
    const provider = new CloudinaryProvider({
      cloudName: "",
      apiKey: "",
      apiSecret: "",
    });
    await expect(provider.transform(baseInput())).rejects.toThrow(
      /cloudName, apiKey, and apiSecret/,
    );
  });

  it("throws a clear error when source bytes are missing", async () => {
    const provider = makeProvider(async () => new Response());
    await expect(
      provider.transform({ ...baseInput(), sourceBytes: undefined }),
    ).rejects.toThrow(/source bytes/);
  });

  it("returns real bytes with simulated: false on a mocked successful round-trip", async () => {
    const variantBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const mockFetch = async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("api.cloudinary.com")) {
        return new Response(
          JSON.stringify({
            eager: [
              {
                secure_url:
                  "https://res.cloudinary.com/demo/image/upload/f_jpg/imageryx/asset-1/hash-abc.jpg",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(variantBytes, {
        headers: { "content-type": "image/jpeg" },
      });
    };

    const provider = makeProvider(mockFetch as typeof fetch);
    const result = await provider.transform(baseInput());

    expect(result.simulated).toBe(false);
    expect(result.bytes).toEqual(variantBytes);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(variantBytes.byteLength);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.deliveryUrl).toBeNull();
    expect(result.storageKey).toBeNull();
  });

  it("sends the expected upload parameters and transformation string", async () => {
    const variantBytes = new Uint8Array([0xff, 0xd8]);
    const calls: Array<{ url: string; body: FormData }> = [];
    const mockFetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = input.toString();
      if (url.includes("api.cloudinary.com")) {
        calls.push({ url, body: init?.body as FormData });
        return new Response(
          JSON.stringify({
            eager: [
              {
                secure_url:
                  "https://res.cloudinary.com/demo/image/upload/f_jpg/imageryx/asset-1/hash-abc.jpg",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(variantBytes);
    };

    const provider = makeProvider(mockFetch as typeof fetch);
    await provider.transform(baseInput());

    expect(calls).toHaveLength(1);
    const uploadCall = calls[0]!;
    expect(uploadCall.url).toBe(
      "https://api.cloudinary.com/v1_1/demo/image/upload",
    );
    expect(uploadCall.body.get("api_key")).toBe(CREDS.apiKey);
    expect(uploadCall.body.get("public_id")).toBe("imageryx/asset-1/hash-abc");
    const eager = uploadCall.body.get("eager");
    expect(eager).toContain("c_fill");
    expect(eager).toContain("w_320");
    expect(eager).toContain("h_240");
    expect(eager).toContain("q_82");
    expect(eager).toContain("f_jpg");
    expect(eager).toContain("g_south_east");
    const signature = uploadCall.body.get("signature");
    expect(signature).toMatch(/^[a-f0-9]{40}$/);
  });

  it("does not leak secrets in upload failure messages", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({ error: { message: `Invalid ${CREDS.apiSecret}` } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    const provider = makeProvider(mockFetch as typeof fetch);
    await expect(provider.transform(baseInput())).rejects.toSatisfy(
      (error: Error) => {
        expect(error.message).toContain("Cloudinary upload failed (400)");
        expect(error.message).not.toContain(CREDS.apiSecret);
        expect(error.message).not.toContain(CREDS.apiKey);
        return true;
      },
    );
  });

  it("throws when Cloudinary returns no eager transformation URL", async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ eager: [] }), {
        headers: { "content-type": "application/json" },
      });
    const provider = makeProvider(mockFetch as typeof fetch);
    await expect(provider.transform(baseInput())).rejects.toThrow(
      /did not return an eager transformation URL/,
    );
  });
});
