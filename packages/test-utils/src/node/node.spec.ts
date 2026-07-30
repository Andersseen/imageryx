import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createTemporaryStorageDirectory, createTestDatabase } from "./index";

describe("createTemporaryStorageDirectory", () => {
  it("creates a real, empty, writable directory and cleans it up", async () => {
    const { path, cleanup } = await createTemporaryStorageDirectory();
    const info = await stat(path);
    expect(info.isDirectory()).toBe(true);

    await cleanup();
    await expect(stat(path)).rejects.toThrow();
  });

  it("creates a distinct directory on each call", async () => {
    const a = await createTemporaryStorageDirectory();
    const b = await createTemporaryStorageDirectory();
    expect(a.path).not.toBe(b.path);
    await Promise.all([a.cleanup(), b.cleanup()]);
  });
});

describe("createTestDatabase (re-exported from @imageryx/database/testing)", () => {
  it("is usable from the test-utils/node subpath", async () => {
    const { db, teardown } = await createTestDatabase();
    try {
      const result = await db
        .prepare("SELECT 1 as value")
        .first<{ value: number }>();
      expect(result?.value).toBe(1);
    } finally {
      await teardown();
    }
  });
});
