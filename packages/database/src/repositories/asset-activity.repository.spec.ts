import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestAsset, insertTestProject } from "../testing/fixtures";
import { AssetActivityRepository } from "./asset-activity.repository";

describe("AssetActivityRepository", () => {
  let testDb: TestDatabase;
  let repository: AssetActivityRepository;
  let projectId: string;
  let assetId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new AssetActivityRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
    assetId = (await insertTestAsset(testDb.db, projectId)).id;
  });

  afterEach(() => testDb.teardown());

  it("records an event with structured metadata", async () => {
    const activity = await repository.record({
      assetId,
      projectId,
      event: "asset.created",
      metadata: { storageKey: "originals/x" },
    });
    expect(activity.event).toBe("asset.created");
    expect(activity.metadata).toEqual({ storageKey: "originals/x" });
  });

  it("records an event with no metadata as null, not an empty object", async () => {
    const activity = await repository.record({
      assetId,
      projectId,
      event: "asset.viewed",
    });
    expect(activity.metadata).toBeNull();
  });

  it("lists activity for an asset, most recent first", async () => {
    await repository.record({ assetId, projectId, event: "asset.created" });
    await repository.record({ assetId, projectId, event: "asset.updated" });

    const list = await repository.listByAsset(assetId);
    expect(list.map((a) => a.event)).toEqual([
      "asset.updated",
      "asset.created",
    ]);
  });

  it("lists activity scoped to a project", async () => {
    const otherAsset = await insertTestAsset(testDb.db, projectId);
    await repository.record({ assetId, projectId, event: "asset.created" });
    await repository.record({
      assetId: otherAsset.id,
      projectId,
      event: "asset.created",
    });

    const list = await repository.listByProject(projectId);
    expect(list).toHaveLength(2);
  });
});
