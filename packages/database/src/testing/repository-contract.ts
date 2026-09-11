import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FolderPathConflictError } from "@imageryx/image-core";
import type { DatabaseClient } from "../client";
import { AssetActivityRepository } from "../repositories/asset-activity.repository";
import { AssetRepository } from "../repositories/asset.repository";
import { FolderRepository } from "../repositories/folder.repository";
import { PresetRepository } from "../repositories/preset.repository";
import { ProcessingJobRepository } from "../repositories/processing-job.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { VariantRepository } from "../repositories/variant.repository";
import { AssetPersistenceService } from "../services/asset-persistence.service";
import { FolderPersistenceService } from "../services/folder-persistence.service";
import { insertTestAsset, insertTestProject } from "./fixtures";

export interface ContractDatabase {
  db: DatabaseClient;
  teardown: () => Promise<void>;
}

/**
 * Proves the repository/service layer behaves identically on D1 and
 * SQLite by running one shared suite against whatever `DatabaseClient`
 * `createDb()` produces. Deliberately not exhaustive — the ~9 existing
 * per-repository `.spec.ts` files already exercise D1 in depth and keep
 * passing unchanged against this same abstraction (see `create-test-database.ts`).
 * This suite exists only to cover the load-bearing cross-cutting behaviors
 * the task calls out explicitly, once, for both backends.
 */
export function describeRepositoryContract(
  label: string,
  createDb: () => Promise<ContractDatabase>,
): void {
  describe(`repository contract (${label})`, () => {
    let ctx: ContractDatabase;
    let db: DatabaseClient;

    beforeEach(async () => {
      ctx = await createDb();
      db = ctx.db;
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it("migrates from zero to a queryable schema", async () => {
      const rows = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      const tableNames = rows.map((row) => row.name);
      expect(tableNames).toEqual(
        expect.arrayContaining([
          "projects",
          "folders",
          "assets",
          "tags",
          "asset_tags",
          "presets",
          "variants",
          "processing_jobs",
          "api_keys",
          "asset_activity",
        ]),
      );
    });

    it("creates, reads, and updates a project, enforcing a unique slug", async () => {
      const projects = new ProjectRepository(db);
      const project = await projects.create({ name: "Demo", slug: "demo" });
      expect(await projects.findById(project.id)).toEqual(project);

      const updated = await projects.update(project.id, {
        name: "Demo Renamed",
      });
      expect(updated?.name).toBe("Demo Renamed");

      await expect(
        projects.create({ name: "Duplicate", slug: "demo" }),
      ).rejects.toThrow();
    });

    it("nests folders and enforces a unique path per project", async () => {
      const project = await insertTestProject(db);
      const folders = new FolderRepository(db);
      const parent = await folders.create({
        projectId: project.id,
        parentId: null,
        name: "Parent",
        slug: "parent",
        path: "parent",
      });
      const child = await folders.create({
        projectId: project.id,
        parentId: parent.id,
        name: "Child",
        slug: "child",
        path: "parent/child",
      });
      expect(child.path).toBe("parent/child");

      await expect(
        folders.create({
          projectId: project.id,
          parentId: null,
          name: "Duplicate parent",
          slug: "parent",
          path: "parent",
        }),
      ).rejects.toThrow();
    });

    it("cascades a folder move to nested descendant folders and assets, leaving storage keys unchanged", async () => {
      const project = await insertTestProject(db);
      const folders = new FolderRepository(db);
      const assets = new AssetRepository(db);

      const source = await folders.create({
        projectId: project.id,
        parentId: null,
        name: "Angular Lab",
        slug: "angular-lab",
        path: "angular-lab",
      });
      const nested = await folders.create({
        projectId: project.id,
        parentId: source.id,
        name: "Courses",
        slug: "courses",
        path: "angular-lab/courses",
      });
      const destination = await folders.create({
        projectId: project.id,
        parentId: null,
        name: "Learning",
        slug: "learning",
        path: "learning",
      });

      const directAsset = await insertTestAsset(db, project.id, {
        folderId: source.id,
        path: "angular-lab/hero",
      });
      const nestedAsset = await insertTestAsset(db, project.id, {
        folderId: nested.id,
        path: "angular-lab/courses/signals",
      });
      const originalStorageKeys = [
        directAsset.storageKey,
        nestedAsset.storageKey,
      ];

      const moved = await new FolderPersistenceService(
        db,
      ).moveFolderWithDescendants(source.id, destination.id);
      expect(moved?.path).toBe("learning/angular-lab");

      const movedNested = await folders.findById(nested.id);
      expect(movedNested?.path).toBe("learning/angular-lab/courses");

      const movedDirectAsset = await assets.findById(directAsset.id);
      const movedNestedAsset = await assets.findById(nestedAsset.id);
      expect(movedDirectAsset?.path).toBe("learning/angular-lab/hero");
      expect(movedNestedAsset?.path).toBe(
        "learning/angular-lab/courses/signals",
      );
      // Physical storage keys are never touched by a logical-path rewrite.
      expect([
        movedDirectAsset?.storageKey,
        movedNestedAsset?.storageKey,
      ]).toEqual(originalStorageKeys);
    });

    it("rejects a folder move that would collide with an existing asset path", async () => {
      const project = await insertTestProject(db);
      const folders = new FolderRepository(db);
      const source = await folders.create({
        projectId: project.id,
        parentId: null,
        name: "Source",
        slug: "source",
        path: "source",
      });
      const destination = await folders.create({
        projectId: project.id,
        parentId: null,
        name: "Destination",
        slug: "destination",
        path: "destination",
      });
      await insertTestAsset(db, project.id, {
        folderId: source.id,
        slug: "hero",
        path: "source/hero",
      });
      // An unrelated asset already sitting exactly where the move would land.
      await insertTestAsset(db, project.id, {
        folderId: destination.id,
        slug: "hero",
        path: "destination/source/hero",
      });

      await expect(
        new FolderPersistenceService(db).moveFolderWithDescendants(
          source.id,
          destination.id,
        ),
      ).rejects.toThrow(FolderPathConflictError);
    });

    it("persists asset creation with activity as one batch, and processing jobs referencing it", async () => {
      const project = await insertTestProject(db);
      const asset = await new AssetPersistenceService(
        db,
      ).createAssetWithActivity({
        projectId: project.id,
        folderId: null,
        name: "Hero",
        slug: "hero",
        path: "hero",
        storageKey: `originals/${project.id}/hero/original.png`,
        originalFilename: "hero.png",
        mimeType: "image/png",
        extension: "png",
        sizeBytes: 1024,
        checksum: "b".repeat(64),
        visibility: "private",
        processingStatus: "ready",
      });

      const activity = await new AssetActivityRepository(db).listByAsset(
        asset.id,
      );
      expect(activity).toHaveLength(1);
      expect(activity[0]?.event).toBe("asset.created");

      const jobs = new ProcessingJobRepository(db);
      const job = await jobs.create({
        projectId: project.id,
        assetId: asset.id,
        type: "inspect-metadata",
        input: { type: "inspect-metadata", assetId: asset.id },
      });
      expect(job.status).toBe("queued");

      const found = await jobs.findById(job.id);
      // JSON column mapping: `input` round-trips through JSON.stringify/parse and schema validation.
      expect(found?.input).toEqual({
        type: "inspect-metadata",
        assetId: asset.id,
      });

      const { items, total } = await jobs.listPaginated(
        { projectId: project.id },
        1,
        10,
      );
      expect(total).toBe(1);
      expect(items).toHaveLength(1);
    });

    it("enforces preset uniqueness per project and variant uniqueness per asset+preset", async () => {
      const project = await insertTestProject(db);
      const asset = await insertTestAsset(db, project.id);
      const presets = new PresetRepository(db);
      const preset = await presets.create({
        projectId: project.id,
        name: "Thumbnail",
        slug: "thumbnail",
        operations: [{ type: "resize", width: 200, height: 200, fit: "cover" }],
        outputFormat: "webp",
      });

      await expect(
        presets.create({
          projectId: project.id,
          name: "Duplicate",
          slug: "thumbnail",
          operations: [],
          outputFormat: "auto",
        }),
      ).rejects.toThrow();

      const variants = new VariantRepository(db);
      await variants.create({
        assetId: asset.id,
        presetId: preset.id,
        presetHash: "hash-1",
        provider: "mock",
        status: "pending",
      });

      await expect(
        variants.create({
          assetId: asset.id,
          presetId: preset.id,
          presetHash: "hash-1",
          provider: "mock",
          status: "pending",
        }),
      ).rejects.toThrow();
    });

    it("cascades project deletion to folders, assets, and presets (foreign keys enforced)", async () => {
      const project = await insertTestProject(db);
      const folders = new FolderRepository(db);
      const folder = await folders.create({
        projectId: project.id,
        parentId: null,
        name: "F",
        slug: "f",
        path: "f",
      });
      const asset = await insertTestAsset(db, project.id, {
        folderId: folder.id,
      });

      await new ProjectRepository(db).delete(project.id);

      expect(await folders.findById(folder.id)).toBeNull();
      expect(await new AssetRepository(db).findById(asset.id)).toBeNull();
    });
  });
}
