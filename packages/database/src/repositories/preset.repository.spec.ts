import type { ImageOperation } from "@imageryx/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestProject } from "../testing/fixtures";
import {
  PresetRepository,
  SystemPresetDeletionError,
} from "./preset.repository";

const RESIZE_OP: ImageOperation = {
  type: "resize",
  width: 320,
  height: 320,
  fit: "cover",
  withoutEnlargement: true,
};

describe("PresetRepository", () => {
  let testDb: TestDatabase;
  let repository: PresetRepository;
  let projectId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new PresetRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
  });

  afterEach(() => testDb.teardown());

  it("creates a preset and round-trips its operations through JSON storage", async () => {
    const created = await repository.create({
      projectId,
      name: "Thumbnail",
      slug: "thumbnail",
      operations: [RESIZE_OP],
      outputFormat: "auto",
      quality: 75,
    });

    const found = await repository.findById(created.id);
    expect(found?.operations).toEqual([RESIZE_OP]);
    expect(found?.quality).toBe(75);
  });

  it("finds a preset by slug", async () => {
    const created = await repository.create({
      projectId,
      name: "Avatar",
      slug: "avatar",
      operations: [RESIZE_OP],
      outputFormat: "auto",
    });
    const found = await repository.findBySlug(projectId, "avatar");
    expect(found?.id).toBe(created.id);
  });

  it("rejects a duplicate slug within the same project", async () => {
    await repository.create({
      projectId,
      name: "Content",
      slug: "content",
      operations: [],
      outputFormat: "auto",
    });
    await expect(
      repository.create({
        projectId,
        name: "Content Dup",
        slug: "content",
        operations: [],
        outputFormat: "auto",
      }),
    ).rejects.toThrow();
  });

  it("marks system presets and protects them from deletion", async () => {
    const preset = await repository.create({
      projectId,
      name: "Hero",
      slug: "hero",
      operations: [RESIZE_OP],
      outputFormat: "auto",
      isSystem: true,
    });

    expect(preset.isSystem).toBe(true);
    await expect(repository.delete(preset.id)).rejects.toThrow(
      SystemPresetDeletionError,
    );
    expect(await repository.findById(preset.id)).not.toBeNull();
  });

  it("allows deleting a non-system preset", async () => {
    const preset = await repository.create({
      projectId,
      name: "Custom",
      slug: "custom",
      operations: [],
      outputFormat: "auto",
    });
    await repository.delete(preset.id);
    expect(await repository.findById(preset.id)).toBeNull();
  });

  it("lists presets for a project", async () => {
    await repository.create({
      projectId,
      name: "A",
      slug: "a",
      operations: [],
      outputFormat: "auto",
    });
    await repository.create({
      projectId,
      name: "B",
      slug: "b",
      operations: [],
      outputFormat: "auto",
    });
    const list = await repository.listByProject(projectId);
    expect(list).toHaveLength(2);
  });
});
