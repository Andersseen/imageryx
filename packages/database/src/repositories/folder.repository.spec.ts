import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestProject } from "../testing/fixtures";
import { FolderRepository } from "./folder.repository";

describe("FolderRepository", () => {
  let testDb: TestDatabase;
  let repository: FolderRepository;
  let projectId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new FolderRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
  });

  afterEach(() => testDb.teardown());

  it("creates a root-level folder", async () => {
    const folder = await repository.create({
      projectId,
      name: "Profile",
      slug: "profile",
      path: "profile",
    });
    expect(folder.parentId).toBeNull();
    expect(folder.path).toBe("profile");
  });

  it("creates a nested folder tree", async () => {
    const parent = await repository.create({
      projectId,
      name: "Projects",
      slug: "projects",
      path: "projects",
    });
    const child = await repository.create({
      projectId,
      parentId: parent.id,
      name: "Angular Lab",
      slug: "angular-lab",
      path: "projects/angular-lab",
    });
    expect(child.parentId).toBe(parent.id);

    const children = await repository.listByParent(projectId, parent.id);
    expect(children.map((f) => f.id)).toEqual([child.id]);
  });

  it("finds a folder by its path", async () => {
    const folder = await repository.create({
      projectId,
      name: "Profile",
      slug: "profile",
      path: "profile",
    });
    const found = await repository.findByPath(projectId, "profile");
    expect(found?.id).toBe(folder.id);
  });

  it("rejects a duplicate path within the same project", async () => {
    await repository.create({
      projectId,
      name: "Profile",
      slug: "profile",
      path: "profile",
    });
    await expect(
      repository.create({
        projectId,
        name: "Profile Again",
        slug: "profile-again",
        path: "profile",
      }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate sibling slug at the root level", async () => {
    await repository.create({
      projectId,
      name: "Profile",
      slug: "profile",
      path: "profile",
    });
    await expect(
      repository.create({
        projectId,
        name: "Profile B",
        slug: "profile",
        path: "profile-b",
      }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate sibling slug under the same parent", async () => {
    const parent = await repository.create({
      projectId,
      name: "Projects",
      slug: "projects",
      path: "projects",
    });
    await repository.create({
      projectId,
      parentId: parent.id,
      name: "Cover",
      slug: "cover",
      path: "projects/cover",
    });
    await expect(
      repository.create({
        projectId,
        parentId: parent.id,
        name: "Cover Dup",
        slug: "cover",
        path: "projects/cover-dup",
      }),
    ).rejects.toThrow();
  });

  it("allows the same slug for two folders under different parents", async () => {
    const parentA = await repository.create({
      projectId,
      name: "A",
      slug: "a",
      path: "a",
    });
    const parentB = await repository.create({
      projectId,
      name: "B",
      slug: "b",
      path: "b",
    });
    await expect(
      repository.create({
        projectId,
        parentId: parentA.id,
        name: "Cover",
        slug: "cover",
        path: "a/cover",
      }),
    ).resolves.toBeTruthy();
    await expect(
      repository.create({
        projectId,
        parentId: parentB.id,
        name: "Cover",
        slug: "cover",
        path: "b/cover",
      }),
    ).resolves.toBeTruthy();
  });

  it("cascade-deletes child folders when the parent is deleted", async () => {
    const parent = await repository.create({
      projectId,
      name: "Projects",
      slug: "projects",
      path: "projects",
    });
    const child = await repository.create({
      projectId,
      parentId: parent.id,
      name: "Angular Lab",
      slug: "angular-lab",
      path: "projects/angular-lab",
    });

    await repository.delete(parent.id);

    expect(await repository.findById(child.id)).toBeNull();
  });
});
