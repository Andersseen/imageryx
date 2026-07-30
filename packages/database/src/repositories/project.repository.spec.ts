import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { ProjectRepository } from "./project.repository";

describe("ProjectRepository", () => {
  let testDb: TestDatabase;
  let repository: ProjectRepository;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new ProjectRepository(testDb.db);
  });

  afterEach(() => testDb.teardown());

  it("creates and reads back a project", async () => {
    const created = await repository.create({
      name: "Andersseen Portfolio",
      slug: "andersseen-portfolio",
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Andersseen Portfolio");
    expect(created.isDefault).toBe(false);

    const found = await repository.findById(created.id);
    expect(found).toEqual(created);
  });

  it("finds a project by slug", async () => {
    const created = await repository.create({
      name: "Angular Lab",
      slug: "angular-lab",
    });
    const found = await repository.findBySlug("angular-lab");
    expect(found?.id).toBe(created.id);
  });

  it("returns null for a missing project", async () => {
    expect(await repository.findById("does-not-exist")).toBeNull();
  });

  it("rejects a duplicate project slug", async () => {
    await repository.create({ name: "First", slug: "dup" });
    await expect(
      repository.create({ name: "Second", slug: "dup" }),
    ).rejects.toThrow();
  });

  it("lists projects ordered by creation time", async () => {
    const a = await repository.create({ name: "A", slug: "a-project" });
    const b = await repository.create({ name: "B", slug: "b-project" });
    const list = await repository.list();
    expect(list.map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it("updates a project and preserves untouched fields", async () => {
    const created = await repository.create({
      name: "Original",
      slug: "orig",
      description: "desc",
    });
    const updated = await repository.update(created.id, { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.description).toBe("desc");
    expect(updated?.slug).toBe("orig");
  });

  it("returns null when updating a project that does not exist", async () => {
    expect(await repository.update("missing", { name: "x" })).toBeNull();
  });

  it("deletes a project", async () => {
    const created = await repository.create({ name: "Temp", slug: "temp" });
    await repository.delete(created.id);
    expect(await repository.findById(created.id)).toBeNull();
  });

  it("maps a null description and boolean isDefault correctly (row mapping)", async () => {
    const created = await repository.create({
      name: "Default Project",
      slug: "default-project",
      isDefault: true,
    });
    expect(created.description).toBeNull();
    expect(created.isDefault).toBe(true);

    const found = await repository.findById(created.id);
    expect(found?.isDefault).toBe(true);
    expect(typeof found?.isDefault).toBe("boolean");
  });
});
