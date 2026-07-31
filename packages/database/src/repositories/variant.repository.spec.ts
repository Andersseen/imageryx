import { DuplicateVariantError } from "@imageryx/image-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestAsset, insertTestProject } from "../testing/fixtures";
import { PresetRepository } from "./preset.repository";
import { VariantRepository } from "./variant.repository";

describe("VariantRepository", () => {
  let testDb: TestDatabase;
  let repository: VariantRepository;
  let projectId: string;
  let assetId: string;
  let presetId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new VariantRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
    assetId = (await insertTestAsset(testDb.db, projectId)).id;
    presetId = (
      await new PresetRepository(testDb.db).create({
        projectId,
        name: "Thumbnail",
        slug: "thumbnail",
        operations: [],
        outputFormat: "auto",
      })
    ).id;
  });

  afterEach(() => testDb.teardown());

  it("creates a variant in pending status with no output fields yet", async () => {
    const variant = await repository.create({
      assetId,
      presetId,
      presetHash: "hash-1",
      provider: "mock",
      status: "pending",
    });
    expect(variant.status).toBe("pending");
    expect(variant.storageKey).toBeNull();
  });

  it("prevents a duplicate variant for the same asset and preset hash", async () => {
    await repository.create({
      assetId,
      presetId,
      presetHash: "hash-1",
      provider: "mock",
      status: "pending",
    });
    await expect(
      repository.create({
        assetId,
        presetId,
        presetHash: "hash-1",
        provider: "mock",
        status: "pending",
      }),
    ).rejects.toThrow(DuplicateVariantError);
  });

  it("allows the same preset hash for a different asset", async () => {
    const otherAsset = await insertTestAsset(testDb.db, projectId);
    await repository.create({
      assetId,
      presetId,
      presetHash: "hash-1",
      provider: "mock",
      status: "pending",
    });
    await expect(
      repository.create({
        assetId: otherAsset.id,
        presetId,
        presetHash: "hash-1",
        provider: "mock",
        status: "pending",
      }),
    ).resolves.toBeTruthy();
  });

  it("finds a variant by asset and preset hash", async () => {
    const created = await repository.create({
      assetId,
      presetId,
      presetHash: "hash-1",
      provider: "mock",
      status: "pending",
    });
    const found = await repository.findByAssetAndPresetHash(assetId, "hash-1");
    expect(found?.id).toBe(created.id);
  });

  it("lists only ready variants' preset slugs, grouped by asset", async () => {
    const otherAsset = await insertTestAsset(testDb.db, projectId);
    const heroPresetId = (
      await new PresetRepository(testDb.db).create({
        projectId,
        name: "Hero",
        slug: "hero",
        operations: [],
        outputFormat: "auto",
      })
    ).id;

    const ready = await repository.create({
      assetId,
      presetId,
      presetHash: "hash-ready",
      provider: "mock",
      status: "pending",
    });
    await repository.update(ready.id, { status: "ready" });
    // Deliberately left pending — a pending variant's delivery URL does not resolve.
    await repository.create({
      assetId,
      presetId: heroPresetId,
      presetHash: "hash-pending",
      provider: "mock",
      status: "pending",
    });
    const otherReady = await repository.create({
      assetId: otherAsset.id,
      presetId: heroPresetId,
      presetHash: "hash-other",
      provider: "mock",
      status: "pending",
    });
    await repository.update(otherReady.id, { status: "ready" });

    const slugs = await repository.listReadyPresetSlugsByAssetIds([
      assetId,
      otherAsset.id,
    ]);
    expect(slugs.get(assetId)).toEqual(["thumbnail"]);
    expect(slugs.get(otherAsset.id)).toEqual(["hero"]);
  });

  it("returns an empty map for no asset ids", async () => {
    await expect(
      repository.listReadyPresetSlugsByAssetIds([]),
    ).resolves.toEqual(new Map());
  });

  it("transitions a variant to ready with output fields populated", async () => {
    const created = await repository.create({
      assetId,
      presetId,
      presetHash: "hash-1",
      provider: "mock",
      status: "pending",
    });
    const updated = await repository.update(created.id, {
      status: "ready",
      storageKey: `derived/${projectId}/${assetId}/hash-1.png`,
      width: 320,
      height: 320,
      sizeBytes: 4096,
    });
    expect(updated?.status).toBe("ready");
    expect(updated?.storageKey).toContain("derived/");
    expect(updated?.width).toBe(320);
  });
});
