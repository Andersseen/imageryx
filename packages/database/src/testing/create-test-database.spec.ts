import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./create-test-database";

describe("createTestDatabase", () => {
  it("applies migrations and exposes a queryable DatabaseClient", async () => {
    const { db, teardown } = await createTestDatabase();
    try {
      const rows = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = ? ORDER BY name",
        ["table"],
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
    } finally {
      await teardown();
    }
  });

  it("enforces the projects.slug UNIQUE constraint", async () => {
    const { db, teardown } = await createTestDatabase();
    try {
      const now = new Date().toISOString();
      await db.execute(
        "INSERT INTO projects (id, name, slug, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["p1", "Project One", "dup-slug", null, 0, now, now],
      );

      await expect(
        db.execute(
          "INSERT INTO projects (id, name, slug, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ["p2", "Project Two", "dup-slug", null, 0, now, now],
        ),
      ).rejects.toThrow();
    } finally {
      await teardown();
    }
  });
});
