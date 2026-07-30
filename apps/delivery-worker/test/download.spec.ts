import { AssetRepository, ProjectRepository } from "@imageryx/database";
import { buildOriginalStorageKey, createSignedToken } from "@imageryx/image-core";
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32, 0x08, 0x06,
]);

async function createAsset(downloadOriginalEnabled: boolean) {
  const projects = new ProjectRepository(env.DB);
  const project = await projects.create({ name: "Download Test", slug: `dl-${crypto.randomUUID()}` });
  const assets = new AssetRepository(env.DB);
  const assetId = crypto.randomUUID();
  const storageKey = buildOriginalStorageKey(project.id, assetId, "png");
  await env.ASSET_STORAGE.put(storageKey, PNG_BYTES);
  const asset = await assets.create(
    {
      projectId: project.id,
      name: "Private original",
      slug: "private-original",
      path: "private-original",
      storageKey,
      originalFilename: "private-original.png",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: PNG_BYTES.byteLength,
      checksum: "c".repeat(64),
      visibility: "private",
      processingStatus: "ready",
      downloadOriginalEnabled,
    },
    assetId,
  );
  return asset;
}

describe("GET /download/:token", () => {
  it("streams the original with an attachment Content-Disposition for a valid token", async () => {
    const asset = await createAsset(true);
    const token = await createSignedToken(
      { assetId: asset.id, variant: "original", exp: Math.floor(Date.now() / 1000) + 900, nonce: "n" },
      env.DOWNLOAD_SIGNING_SECRET,
    );

    const response = await SELF.fetch(`https://example.com/download/${token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain(asset.originalFilename);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(PNG_BYTES);
  });

  it("rejects an expired token", async () => {
    const asset = await createAsset(true);
    const token = await createSignedToken(
      { assetId: asset.id, variant: "original", exp: Math.floor(Date.now() / 1000) - 10, nonce: "n" },
      env.DOWNLOAD_SIGNING_SECRET,
    );

    const response = await SELF.fetch(`https://example.com/download/${token}`);
    expect(response.status).toBe(410);
  });

  it("rejects a tampered token", async () => {
    const asset = await createAsset(true);
    const token = await createSignedToken(
      { assetId: asset.id, variant: "original", exp: Math.floor(Date.now() / 1000) + 900, nonce: "n" },
      env.DOWNLOAD_SIGNING_SECRET,
    );
    const [payload] = token.split(".");
    const tampered = `${payload}.tampered-signature`;

    const response = await SELF.fetch(`https://example.com/download/${tampered}`);
    expect(response.status).toBe(400);
  });

  it("rejects a malformed token", async () => {
    const response = await SELF.fetch("https://example.com/download/not-a-real-token");
    expect(response.status).toBe(400);
  });

  it("refuses to serve the original when downloads are disabled for the asset", async () => {
    const asset = await createAsset(false);
    const token = await createSignedToken(
      { assetId: asset.id, variant: "original", exp: Math.floor(Date.now() / 1000) + 900, nonce: "n" },
      env.DOWNLOAD_SIGNING_SECRET,
    );

    const response = await SELF.fetch(`https://example.com/download/${token}`);
    expect(response.status).toBe(404);
  });
});
