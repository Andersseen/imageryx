import {
  AssetRepository,
  PresetRepository,
  ProjectRepository,
  VariantRepository,
} from "@imageryx/database";
import { buildOriginalStorageKey, hashPreset } from "@imageryx/image-core";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32, 0x08, 0x06,
]);

describe("delivery route", () => {
  let projects: ProjectRepository;
  let assets: AssetRepository;
  let presets: PresetRepository;
  let variants: VariantRepository;
  let projectSlug: string;
  let projectId: string;

  beforeEach(async () => {
    projects = new ProjectRepository(env.DB);
    assets = new AssetRepository(env.DB);
    presets = new PresetRepository(env.DB);
    variants = new VariantRepository(env.DB);

    projectSlug = `delivery-${crypto.randomUUID()}`;
    const project = await projects.create({ name: "Delivery Test", slug: projectSlug });
    projectId = project.id;
  });

  async function createAsset(overrides: {
    slug?: string;
    path?: string;
    visibility?: "public" | "private";
    deleted?: boolean;
  } = {}) {
    const assetId = crypto.randomUUID();
    const storageKey = buildOriginalStorageKey(projectId, assetId, "png");
    await env.ASSET_STORAGE.put(storageKey, PNG_BYTES);

    const slug = overrides.slug ?? "hero";
    const asset = await assets.create(
      {
        projectId,
        name: "Hero",
        slug,
        path: overrides.path ?? slug,
        storageKey,
        originalFilename: "hero.png",
        mimeType: "image/png",
        extension: "png",
        sizeBytes: PNG_BYTES.byteLength,
        checksum: "a".repeat(64),
        visibility: overrides.visibility ?? "public",
        processingStatus: "ready",
        downloadOriginalEnabled: true,
      },
      assetId,
    );

    if (overrides.deleted) {
      await assets.softDelete(assetId);
    }

    return asset;
  }

  it("serves a public original with correct headers", async () => {
    const asset = await createAsset();
    const response = await SELF.fetch(`https://example.com/${projectSlug}/assets/${asset.path}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Length")).toBe(String(PNG_BYTES.byteLength));
    expect(response.headers.get("ETag")).toBe(`"${asset.checksum}"`);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(PNG_BYTES);
  });

  it("returns 304 when If-None-Match matches the current ETag", async () => {
    const asset = await createAsset();
    const response = await SELF.fetch(`https://example.com/${projectSlug}/assets/${asset.path}`, {
      headers: { "If-None-Match": `"${asset.checksum}"` },
    });
    expect(response.status).toBe(304);
  });

  it("returns 404 for a private asset without revealing its existence", async () => {
    const asset = await createAsset({ visibility: "private", slug: "secret" });
    const response = await SELF.fetch(`https://example.com/${projectSlug}/assets/${asset.path}`);
    expect(response.status).toBe(404);
  });

  it("returns 404 for a soft-deleted asset", async () => {
    const asset = await createAsset({ slug: "gone", deleted: true });
    const response = await SELF.fetch(`https://example.com/${projectSlug}/assets/${asset.path}`);
    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown project", async () => {
    const response = await SELF.fetch("https://example.com/no-such-project/assets/anything");
    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown asset path", async () => {
    const response = await SELF.fetch(`https://example.com/${projectSlug}/assets/does-not-exist`);
    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown preset", async () => {
    const asset = await createAsset({ slug: "hero2" });
    const response = await SELF.fetch(
      `https://example.com/${projectSlug}/assets/${asset.path}/p/no-such-preset`,
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for a preset with no ready variant yet", async () => {
    const asset = await createAsset({ slug: "hero3" });
    const preset = await presets.create({
      projectId,
      name: "Thumbnail",
      slug: "thumbnail",
      operations: [{ type: "resize", width: 100, height: 100, fit: "cover" }],
      outputFormat: "auto",
      quality: 75,
    });
    const response = await SELF.fetch(
      `https://example.com/${projectSlug}/assets/${asset.path}/p/${preset.slug}`,
    );
    expect(response.status).toBe(404);
  });

  it("serves a ready variant with immutable cache headers and the simulated header", async () => {
    const asset = await createAsset({ slug: "hero4" });
    const preset = await presets.create({
      projectId,
      name: "Thumbnail",
      slug: "thumbnail-ready",
      operations: [{ type: "resize", width: 100, height: 100, fit: "cover" }],
      outputFormat: "auto",
      quality: 75,
    });
    const presetHash = await hashPreset({
      operations: preset.operations,
      outputFormat: preset.outputFormat,
      quality: preset.quality,
    });
    const variantBytes = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    const variantKey = `derived/${projectId}/${asset.id}/${presetHash}.svg`;
    await env.ASSET_STORAGE.put(variantKey, variantBytes);
    const variant = await variants.create({
      assetId: asset.id,
      presetId: preset.id,
      presetHash,
      provider: "mock",
      status: "pending",
    });
    await variants.update(variant.id, {
      status: "ready",
      storageKey: variantKey,
      mimeType: "image/svg+xml",
      checksum: "b".repeat(64),
      sizeBytes: variantBytes.byteLength,
    });

    const response = await SELF.fetch(
      `https://example.com/${projectSlug}/assets/${asset.path}/p/${preset.slug}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(response.headers.get("X-Imageryx-Simulated")).toBe("true");
    expect(response.headers.get("ETag")).toBe(`"${"b".repeat(64)}"`);
  });

  it("GET /health returns a healthy status", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);
  });
});
