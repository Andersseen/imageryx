import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssetActivityRepository } from "../repositories/asset-activity.repository";
import { AssetRepository } from "../repositories/asset.repository";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestProject } from "../testing/fixtures";
import { AssetPersistenceService } from "./asset-persistence.service";

describe("AssetPersistenceService", () => {
  let testDb: TestDatabase;
  let service: AssetPersistenceService;
  let assets: AssetRepository;
  let activity: AssetActivityRepository;
  let projectId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    service = new AssetPersistenceService(testDb.db);
    assets = new AssetRepository(testDb.db);
    activity = new AssetActivityRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
  });

  afterEach(() => testDb.teardown());

  it("creates the asset and its initial activity row together", async () => {
    const asset = await service.createAssetWithActivity({
      projectId,
      name: "Hero",
      slug: "hero",
      path: "hero",
      storageKey: "originals/p/a/original.png",
      originalFilename: "hero.png",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: 1024,
      checksum: "a".repeat(64),
      visibility: "private",
      processingStatus: "ready",
    });

    expect(await assets.findById(asset.id)).not.toBeNull();
    const activityRows = await activity.listByAsset(asset.id);
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0]?.event).toBe("asset.created");
  });

  it("soft-deletes the asset and records activity together", async () => {
    const asset = await service.createAssetWithActivity({
      projectId,
      name: "Hero",
      slug: "hero",
      path: "hero",
      storageKey: "originals/p/a/original.png",
      originalFilename: "hero.png",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: 1024,
      checksum: "a".repeat(64),
      visibility: "private",
      processingStatus: "ready",
    });

    await service.softDeleteAssetWithActivity(asset.id, projectId);

    const found = await assets.findById(asset.id);
    expect(found?.deletedAt).not.toBeNull();

    const activityRows = await activity.listByAsset(asset.id);
    expect(activityRows.map((a) => a.event)).toEqual([
      "asset.soft_deleted",
      "asset.created",
    ]);
  });
});
