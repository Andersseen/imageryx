import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseProviderConfig } from "../config/provider-config.schema";
import { LocalStorageProvider } from "../storage/local-storage.provider";
import { R2StorageProvider } from "../storage/r2-storage.provider";
import { MockTransformationProvider } from "../transformations/mock-transformation.provider";
import {
  createProviderRegistry,
  createStorageProvider,
} from "./local-storage-registry";

describe('createStorageProvider (Node-only, adds "local")', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "imageryx-node-registry-test-"));
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("creates a local storage provider from config", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "local",
      TRANSFORMATION_PROVIDER: "mock",
      LOCAL_STORAGE_PATH: root,
    });
    expect(createStorageProvider({ config })).toBeInstanceOf(
      LocalStorageProvider,
    );
  });

  it("still delegates to the base registry for r2", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "r2",
      TRANSFORMATION_PROVIDER: "mock",
    });
    const bucket = {} as ConstructorParameters<typeof R2StorageProvider>[0];
    expect(createStorageProvider({ config, r2Bucket: bucket })).toBeInstanceOf(
      R2StorageProvider,
    );
  });
});

describe("createProviderRegistry (Node-only)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "imageryx-node-registry-test-"));
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("builds the local/mock registry with no advanced transformation provider", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "local",
      TRANSFORMATION_PROVIDER: "mock",
      LOCAL_STORAGE_PATH: root,
    });
    const registry = createProviderRegistry({ config });
    expect(registry.storage).toBeInstanceOf(LocalStorageProvider);
    expect(registry.transformation).toBeInstanceOf(MockTransformationProvider);
    expect(registry.advancedTransformation).toBeNull();
  });
});
