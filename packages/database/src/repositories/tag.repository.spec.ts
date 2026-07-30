import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestAsset, insertTestProject } from "../testing/fixtures";
import { TagRepository } from "./tag.repository";

describe("TagRepository", () => {
  let testDb: TestDatabase;
  let repository: TagRepository;
  let projectId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new TagRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
  });

  afterEach(() => testDb.teardown());

  it("creates a tag on first use and reuses it on subsequent calls", async () => {
    const first = await repository.findOrCreate(projectId, "portfolio");
    const second = await repository.findOrCreate(projectId, "portfolio");
    expect(second.id).toBe(first.id);

    const tags = await repository.listByProject(projectId);
    expect(tags).toHaveLength(1);
  });

  it("scopes tags per project (same name allowed in a different project)", async () => {
    const otherProjectId = (await insertTestProject(testDb.db)).id;
    const tagA = await repository.findOrCreate(projectId, "cover");
    const tagB = await repository.findOrCreate(otherProjectId, "cover");
    expect(tagA.id).not.toBe(tagB.id);
  });

  it("assigns and lists tags for an asset", async () => {
    const asset = await insertTestAsset(testDb.db, projectId);
    const tagA = await repository.findOrCreate(projectId, "cover");
    const tagB = await repository.findOrCreate(projectId, "profile");

    await repository.setAssetTags(asset.id, [tagA.id, tagB.id]);

    const tags = await repository.listAssetTags(asset.id);
    expect(tags.map((t) => t.name).sort()).toEqual(["cover", "profile"]);
  });

  it("replaces an asset's tags on a second call rather than appending", async () => {
    const asset = await insertTestAsset(testDb.db, projectId);
    const tagA = await repository.findOrCreate(projectId, "cover");
    const tagB = await repository.findOrCreate(projectId, "profile");

    await repository.setAssetTags(asset.id, [tagA.id]);
    await repository.setAssetTags(asset.id, [tagB.id]);

    const tags = await repository.listAssetTags(asset.id);
    expect(tags.map((t) => t.name)).toEqual(["profile"]);
  });
});
