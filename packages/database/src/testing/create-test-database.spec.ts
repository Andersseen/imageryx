import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./create-test-database";

describe("createTestDatabase", () => {
  it("applies migrations and exposes a queryable D1 database", async () => {
    const { db, teardown } = await createTestDatabase();
    try {
      const result = await db
        .prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
        .bind("table")
        .all();
      const tableNames = result.results.map(
        (row) => (row as { name: string }).name,
      );
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
    } finally {
      await teardown();
    }
  });

  it("enforces the projects.slug UNIQUE constraint", async () => {
    const { db, teardown } = await createTestDatabase();
    try {
      const now = new Date().toISOString();
      await db
        .prepare(
          "INSERT INTO projects (id, name, slug, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("p1", "Project One", "dup-slug", null, 0, now, now)
        .run();

      await expect(
        db
          .prepare(
            "INSERT INTO projects (id, name, slug, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind("p2", "Project Two", "dup-slug", null, 0, now, now)
          .run(),
      ).rejects.toThrow();
    } finally {
      await teardown();
    }
  });
});
