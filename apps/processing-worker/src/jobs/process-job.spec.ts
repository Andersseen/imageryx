import type { R2Bucket } from "@cloudflare/workers-types";
import {
  AssetRepository,
  PresetRepository,
  ProcessingJobRepository,
  ProjectRepository,
  VariantRepository,
} from "@imageryx/database";
import { buildOriginalStorageKey } from "@imageryx/image-core";
import { R2StorageProvider } from "@imageryx/providers";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingDeps } from "./deps";
import { processJob } from "./process-job";

const PNG_BYTES = (() => {
  const bytes = new Uint8Array(29);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes.set([0x00, 0x00, 0x01, 0x00], 16); // width = 256
  bytes.set([0x00, 0x00, 0x00, 0xc8], 20); // height = 200
  bytes[24] = 0x08;
  bytes[25] = 0x06; // truecolor + alpha
  return bytes;
})();

describe("processJob", () => {
  let deps: ProcessingDeps;
  let projects: ProjectRepository;
  let assets: AssetRepository;
  let jobs: ProcessingJobRepository;
  let variants: VariantRepository;
  let presets: PresetRepository;
  let projectId: string;

  beforeEach(async () => {
    const storage = new R2StorageProvider(env.ASSET_STORAGE as unknown as R2Bucket);
    deps = { db: env.DB, storage, maxAttempts: 3, cloudinary: null };
    projects = new ProjectRepository(env.DB);
    assets = new AssetRepository(env.DB);
    jobs = new ProcessingJobRepository(env.DB);
    variants = new VariantRepository(env.DB);
    presets = new PresetRepository(env.DB);

    const project = await projects.create({ name: "Test Project", slug: `test-${crypto.randomUUID()}` });
    projectId = project.id;
  });

  async function createAsset(overrides: { storeBytes?: Uint8Array } = {}) {
    const assetId = crypto.randomUUID();
    const storageKey = buildOriginalStorageKey(projectId, assetId, "png");
    await deps.storage.put({
      key: storageKey,
      body: overrides.storeBytes ?? PNG_BYTES,
      contentType: "image/png",
    });
    return assets.create(
      {
        projectId,
        name: "Signals hero",
        slug: "signals-hero",
        path: "signals-hero",
        storageKey,
        originalFilename: "signals-hero.png",
        mimeType: "image/png",
        extension: "png",
        sizeBytes: (overrides.storeBytes ?? PNG_BYTES).byteLength,
        checksum: "a".repeat(64),
        visibility: "public",
        processingStatus: "pending",
      },
      assetId,
    );
  }

  it("inspects metadata and transitions the asset to ready", async () => {
    const asset = await createAsset();
    const job = await jobs.create({
      projectId,
      assetId: asset.id,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: asset.id },
    });

    const outcome = await processJob(deps, job.id);
    expect(outcome).toEqual({ outcome: "completed" });

    const updated = await assets.findById(asset.id);
    expect(updated?.processingStatus).toBe("ready");
    expect(updated?.width).toBe(256);
    expect(updated?.height).toBe(200);
    expect(updated?.hasAlpha).toBe(true);
    expect(updated?.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(updated?.placeholder).toContain("data:image/svg+xml;base64,");

    const finishedJob = await jobs.findById(job.id);
    expect(finishedJob?.status).toBe("completed");
    expect(finishedJob?.attempts).toBe(1);
  });

  it("acknowledges (skips) a job that is already completed instead of re-running it", async () => {
    const asset = await createAsset();
    const job = await jobs.create({
      projectId,
      assetId: asset.id,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: asset.id },
    });
    await processJob(deps, job.id);

    const outcome = await processJob(deps, job.id);
    expect(outcome).toEqual({ outcome: "skipped", reason: "already-completed" });
  });

  it("returns skipped for an unknown job ID rather than throwing", async () => {
    const outcome = await processJob(deps, crypto.randomUUID());
    expect(outcome).toEqual({ outcome: "skipped", reason: "not-found" });
  });

  it("marks the asset processing-failed and does not retry a missing storage object", async () => {
    const assetId = crypto.randomUUID();
    const storageKey = buildOriginalStorageKey(projectId, assetId, "png");
    // Note: never actually stored — a genuinely missing object is a permanent failure, not a job the queue should retry.
    const asset = await assets.create(
      {
        projectId,
        name: "Missing bytes",
        slug: "missing-bytes",
        path: "missing-bytes",
        storageKey,
        originalFilename: "missing.png",
        mimeType: "image/png",
        extension: "png",
        sizeBytes: 100,
        checksum: "b".repeat(64),
        visibility: "public",
        processingStatus: "pending",
      },
      assetId,
    );
    const job = await jobs.create({
      projectId,
      assetId: asset.id,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: asset.id },
    });

    const outcome = await processJob(deps, job.id);
    expect(outcome).toEqual({ outcome: "failed", retryable: false, code: "storage_object_not_found" });

    const updatedAsset = await assets.findById(asset.id);
    expect(updatedAsset?.processingStatus).toBe("failed");
  });

  it("generates a mock variant, persisting a real SVG derivative to storage", async () => {
    const asset = await createAsset();
    await processJob(
      deps,
      (
        await jobs.create({
          projectId,
          assetId: asset.id,
          type: "inspect-metadata",
          input: { type: "inspect-metadata", assetId: asset.id },
        })
      ).id,
    );

    const preset = await presets.create({
      projectId,
      name: "Thumbnail",
      slug: "thumbnail",
      operations: [{ type: "resize", width: 100, height: 100, fit: "cover" }],
      outputFormat: "auto",
      quality: 75,
    });
    const presetId = preset.id;
    const variant = await variants.create({
      assetId: asset.id,
      presetId,
      presetHash: "hash-thumbnail",
      provider: "mock",
      status: "pending",
    });

    const job = await jobs.create({
      projectId,
      assetId: asset.id,
      type: "generate-variant",
      input: {
        type: "generate-variant",
        assetId: asset.id,
        presetId,
        presetHash: "hash-thumbnail",
        persist: true,
      },
    });

    const outcome = await processJob(deps, job.id);
    expect(outcome).toEqual({ outcome: "completed" });

    const readyVariant = await variants.findById(variant.id);
    expect(readyVariant?.status).toBe("ready");
    expect(readyVariant?.mimeType).toBe("image/svg+xml");
    expect(readyVariant?.storageKey).toBeTruthy();
    expect(readyVariant?.sizeBytes).toBeGreaterThan(0);

    const stored = await deps.storage.get(readyVariant?.storageKey ?? "");
    expect(stored).not.toBeNull();
  });

  it("does not retry a simulated mock-provider failure (asset slug containing 'fail')", async () => {
    const assetId = crypto.randomUUID();
    const storageKey = buildOriginalStorageKey(projectId, assetId, "png");
    await deps.storage.put({ key: storageKey, body: PNG_BYTES, contentType: "image/png" });
    const asset = await assets.create(
      {
        projectId,
        name: "Failing asset",
        slug: "will-fail-here",
        path: "will-fail-here",
        storageKey,
        originalFilename: "fail.png",
        mimeType: "image/png",
        extension: "png",
        sizeBytes: PNG_BYTES.byteLength,
        checksum: "c".repeat(64),
        visibility: "public",
        processingStatus: "ready",
      },
      assetId,
    );

    const preset = await presets.create({
      projectId,
      name: "Thumbnail",
      slug: "thumbnail-fail",
      operations: [],
      outputFormat: "auto",
      quality: 75,
    });
    const presetId = preset.id;

    const variant = await variants.create({
      assetId: asset.id,
      presetId,
      presetHash: "hash-fail",
      provider: "mock",
      status: "pending",
    });
    const job = await jobs.create({
      projectId,
      assetId: asset.id,
      type: "generate-variant",
      input: {
        type: "generate-variant",
        assetId: asset.id,
        presetId,
        presetHash: "hash-fail",
        persist: true,
      },
    });

    const outcome = await processJob(deps, job.id);
    expect(outcome.outcome).toBe("failed");
    if (outcome.outcome === "failed") {
      expect(outcome.retryable).toBe(false);
      expect(outcome.code).toBe("simulated_transformation_failure");
    }

    const failedVariant = await variants.findById(variant.id);
    expect(failedVariant?.status).toBe("failed");
  });
});
