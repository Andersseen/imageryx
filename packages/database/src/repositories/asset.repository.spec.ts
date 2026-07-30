import type { AssetFilter } from "@imageryx/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestAsset, insertTestProject } from "../testing/fixtures";
import { AssetRepository } from "./asset.repository";

function baseFilter(
  projectId: string,
  overrides: Partial<AssetFilter> = {},
): AssetFilter {
  return {
    projectId,
    deleted: "active",
    sortField: "createdAt",
    sortDirection: "desc",
    page: 1,
    pageSize: 24,
    ...overrides,
  };
}

describe("AssetRepository", () => {
  let testDb: TestDatabase;
  let repository: AssetRepository;
  let projectId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new AssetRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
  });

  afterEach(() => testDb.teardown());

  it("creates and reads back an asset (row mapping round-trip)", async () => {
    const created = await insertTestAsset(testDb.db, projectId, {
      mimeType: "image/webp",
      extension: "webp",
      hasAlpha: true,
    });
    const found = await repository.findById(created.id);
    expect(found).toEqual(created);
    expect(found?.hasAlpha).toBe(true);
    expect(typeof found?.sizeBytes).toBe("number");
  });

  it("enforces a unique storage key", async () => {
    const first = await insertTestAsset(testDb.db, projectId, {
      storageKey: "originals/shared/key.png",
    });
    await expect(
      insertTestAsset(testDb.db, projectId, {
        storageKey: "originals/shared/key.png",
        slug: "other",
      }),
    ).rejects.toThrow();
    expect(first.storageKey).toBe("originals/shared/key.png");
  });

  it("finds an asset by its active public path", async () => {
    const created = await insertTestAsset(testDb.db, projectId, {
      path: "profile/andrii",
    });
    const found = await repository.findByPublicPath(
      projectId,
      "profile/andrii",
    );
    expect(found?.id).toBe(created.id);
  });

  it("filters by mime type", async () => {
    await insertTestAsset(testDb.db, projectId, {
      mimeType: "image/png",
      extension: "png",
    });
    await insertTestAsset(testDb.db, projectId, {
      mimeType: "image/webp",
      extension: "webp",
    });

    const results = await repository.list(
      baseFilter(projectId, { mimeType: "image/webp" }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.mimeType).toBe("image/webp");
  });

  it("filters by visibility", async () => {
    await insertTestAsset(testDb.db, projectId, { visibility: "public" });
    await insertTestAsset(testDb.db, projectId, { visibility: "private" });

    const results = await repository.list(
      baseFilter(projectId, { visibility: "public" }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.visibility).toBe("public");
  });

  it("filters by dimension bounds", async () => {
    await insertTestAsset(testDb.db, projectId, { width: 100, height: 100 });
    await insertTestAsset(testDb.db, projectId, { width: 2000, height: 2000 });

    const results = await repository.list(
      baseFilter(projectId, { minWidth: 500 }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.width).toBe(2000);
  });

  it("filters by search text against name and original filename", async () => {
    await insertTestAsset(testDb.db, projectId, {
      name: "Hero Banner",
      originalFilename: "hero.png",
    });
    await insertTestAsset(testDb.db, projectId, {
      name: "Avatar",
      originalFilename: "avatar.png",
    });

    const results = await repository.list(
      baseFilter(projectId, { search: "hero" }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Hero Banner");
  });

  it("escapes LIKE wildcards in search text instead of treating them as patterns", async () => {
    await insertTestAsset(testDb.db, projectId, {
      name: "50%_off",
      originalFilename: "promo.png",
    });
    await insertTestAsset(testDb.db, projectId, {
      name: "Something Else",
      originalFilename: "other.png",
    });

    const results = await repository.list(
      baseFilter(projectId, { search: "50%_off" }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("50%_off");
  });

  it("excludes soft-deleted assets from the default active filter", async () => {
    const asset = await insertTestAsset(testDb.db, projectId);
    await repository.softDelete(asset.id);

    const active = await repository.list(baseFilter(projectId));
    expect(active).toHaveLength(0);

    const deleted = await repository.list(
      baseFilter(projectId, { deleted: "deleted" }),
    );
    expect(deleted).toHaveLength(1);

    const all = await repository.list(
      baseFilter(projectId, { deleted: "all" }),
    );
    expect(all).toHaveLength(1);
  });

  it("restores a soft-deleted asset", async () => {
    const asset = await insertTestAsset(testDb.db, projectId);
    await repository.softDelete(asset.id);
    await repository.restore(asset.id);

    const found = await repository.findById(asset.id);
    expect(found?.deletedAt).toBeNull();
  });

  it("allows a soft-deleted asset path to be reused by a new active asset", async () => {
    const first = await insertTestAsset(testDb.db, projectId, {
      path: "profile/andrii",
      slug: "first",
    });
    await repository.softDelete(first.id);

    await expect(
      insertTestAsset(testDb.db, projectId, {
        path: "profile/andrii",
        slug: "second",
      }),
    ).resolves.toBeTruthy();
  });

  it("paginates results and reports an accurate total via count()", async () => {
    for (let i = 0; i < 5; i += 1) {
      await insertTestAsset(testDb.db, projectId);
    }

    const page1 = await repository.list(
      baseFilter(projectId, { page: 1, pageSize: 2 }),
    );
    const page2 = await repository.list(
      baseFilter(projectId, { page: 2, pageSize: 2 }),
    );
    const total = await repository.count(
      baseFilter(projectId, { pageSize: 2 }),
    );

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1.map((a) => a.id)).not.toEqual(page2.map((a) => a.id));
    expect(total).toBe(5);
  });

  it("sorts by the requested field and direction", async () => {
    const small = await insertTestAsset(testDb.db, projectId, {
      sizeBytes: 100,
    });
    const large = await insertTestAsset(testDb.db, projectId, {
      sizeBytes: 9999,
    });

    const ascending = await repository.list(
      baseFilter(projectId, { sortField: "sizeBytes", sortDirection: "asc" }),
    );
    expect(ascending.map((a) => a.id)).toEqual([small.id, large.id]);
  });

  it("updates asset metadata and folder assignment", async () => {
    const created = await insertTestAsset(testDb.db, projectId);
    const updated = await repository.update(created.id, {
      name: "Renamed",
      downloadOriginalEnabled: true,
    });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.downloadOriginalEnabled).toBe(true);
    expect(updated?.visibility).toBe(created.visibility);
  });
});
