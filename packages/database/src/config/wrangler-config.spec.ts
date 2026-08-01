import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readApiWorkerD1Config,
  readApiWorkerLocalStoragePath,
  readApiWorkerR2Config,
  readJsonc,
} from "./wrangler-config";

describe("wrangler-config", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "imageryx-wrangler-config-test-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function writeConfig(contents: string): Promise<string> {
    const path = join(dir, "wrangler.jsonc");
    await writeFile(path, contents);
    return path;
  }

  it("readJsonc strips // line comments before parsing", async () => {
    const path = await writeConfig(`{
      // a comment
      "name": "example"
    }`);
    expect(readJsonc(path)).toEqual({ name: "example" });
  });

  it("readApiWorkerD1Config extracts the first d1 binding and database id", async () => {
    const path = await writeConfig(
      JSON.stringify({
        d1_databases: [{ binding: "DB", database_id: "abc-123" }],
      }),
    );
    expect(readApiWorkerD1Config(path)).toEqual({ binding: "DB", databaseId: "abc-123" });
  });

  it("readApiWorkerD1Config throws when d1_databases is missing", async () => {
    const path = await writeConfig(JSON.stringify({}));
    expect(() => readApiWorkerD1Config(path)).toThrow(/no d1_databases entry/);
  });

  it("readApiWorkerD1Config throws when the entry is missing required fields", async () => {
    const path = await writeConfig(JSON.stringify({ d1_databases: [{ binding: "DB" }] }));
    expect(() => readApiWorkerD1Config(path)).toThrow(/missing "binding" or "database_id"/);
  });

  it("readApiWorkerR2Config extracts the first r2 binding and bucket name", async () => {
    const path = await writeConfig(
      JSON.stringify({
        r2_buckets: [{ binding: "ASSET_STORAGE", bucket_name: "imageryx-storage" }],
      }),
    );
    expect(readApiWorkerR2Config(path)).toEqual({
      binding: "ASSET_STORAGE",
      bucketName: "imageryx-storage",
    });
  });

  it("readApiWorkerR2Config throws when r2_buckets is missing", async () => {
    const path = await writeConfig(JSON.stringify({}));
    expect(() => readApiWorkerR2Config(path)).toThrow(/no r2_buckets entry/);
  });

  it("readApiWorkerLocalStoragePath extracts vars.LOCAL_STORAGE_PATH", async () => {
    const path = await writeConfig(
      JSON.stringify({ vars: { LOCAL_STORAGE_PATH: "../../.local/storage" } }),
    );
    expect(readApiWorkerLocalStoragePath(path)).toBe("../../.local/storage");
  });

  it("readApiWorkerLocalStoragePath throws when the var is missing", async () => {
    const path = await writeConfig(JSON.stringify({ vars: {} }));
    expect(() => readApiWorkerLocalStoragePath(path)).toThrow(
      /LOCAL_STORAGE_PATH not found/,
    );
  });
});
