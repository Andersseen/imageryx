import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CloudinaryProvider,
  type CloudinaryProviderOptions,
} from "./cloudinary.provider";

/**
 * Real-account health check for CloudinaryProvider.
 *
 * Reads credentials from `apps/processing-worker/.dev.vars` (git-ignored).
 * If the provider is not configured as `cloudinary` or credentials are missing,
 * the test is skipped.
 */

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const devVarsPath = resolve(
  repoRoot,
  "apps",
  "processing-worker",
  ".dev.vars",
);

function parseDevVars(path: string): Record<string, string> {
  try {
    const text = readFileSync(path, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key && rest.length > 0) {
        vars[key] = rest.join("=").trim();
      }
    }
    return vars;
  } catch {
    return {};
  }
}

const devVars = parseDevVars(devVarsPath);

const creds = {
  cloudName: devVars.CLOUDINARY_CLOUD_NAME ?? "",
  apiKey: devVars.CLOUDINARY_API_KEY ?? "",
  apiSecret: devVars.CLOUDINARY_API_SECRET ?? "",
};

const enabled =
  devVars.TRANSFORMATION_PROVIDER === "cloudinary" &&
  creds.cloudName.length > 0 &&
  creds.apiKey.length > 0 &&
  creds.apiSecret.length > 0;

// Tiny 1x1 red PNG generated inline so the test has no fixture files.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function destroyCloudinaryAsset(
  cloudName: string,
  publicId: string,
  apiKey: string,
  apiSecret: string,
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(signatureBase),
  );
  const signature = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("signature", signature);

  await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    {
      method: "POST",
      body: form,
    },
  );
}

// Vitest treats an empty callback as a skipped suite; we still want a clear message.
const itIfEnabled = enabled ? it : it.skip;

describe("CloudinaryProvider real-account health check", () => {
  itIfEnabled(
    "uploads a tiny PNG, transforms it, and returns real bytes",
    { timeout: 30_000 },
    async () => {
      const assetId = `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const presetHash = "health-preset";
      const sourceBytes = decodeBase64(TINY_PNG_BASE64);

      const provider = new CloudinaryProvider({
        ...creds,
        fetch: globalThis.fetch.bind(globalThis),
      } as CloudinaryProviderOptions);

      try {
        const result = await provider.transform({
          assetId,
          assetSlug: "health-check",
          sourceWidth: 1,
          sourceHeight: 1,
          sourceMimeType: "image/png",
          sourceBytes,
          operations: [
            {
              type: "resize",
              width: 10,
              height: 10,
              fit: "cover",
              position: "center",
            },
          ],
          outputFormat: "jpeg",
          quality: 80,
          presetHash,
        });

        expect(result.simulated).toBe(false);
        expect(result.bytes).toBeInstanceOf(Uint8Array);
        if (!result.bytes) {
          throw new Error("Cloudinary health check returned no bytes");
        }
        expect(result.bytes.byteLength).toBeGreaterThan(0);
        expect(result.mimeType).toMatch(/^image\//);
        expect(result.sizeBytes).toBe(result.bytes.byteLength);
        expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(result.width).toBe(10);
        expect(result.height).toBe(10);
        // Cloudinary eager upload+transform should never be a JPEG magic number mock.
        expect(result.bytes[0]).toBe(0xff);
        expect(result.bytes[1]).toBe(0xd8);
      } finally {
        await destroyCloudinaryAsset(
          creds.cloudName,
          `imageryx/${assetId}/${presetHash}`,
          creds.apiKey,
          creds.apiSecret,
        );
      }
    },
  );

  it("always reports why it is skipped when disabled", () => {
    if (!enabled) {
      console.log(
        "Cloudinary health check skipped. Set TRANSFORMATION_PROVIDER=cloudinary and fill CLOUDINARY_* values in apps/processing-worker/.dev.vars to run against a real account.",
      );
    }
    expect(true).toBe(true);
  });
});
