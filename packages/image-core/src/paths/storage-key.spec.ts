import { describe, expect, it } from "vitest";
import { InvalidImagePathError } from "../errors/domain-errors";
import {
  buildDerivedStorageKey,
  buildExportStorageKey,
  buildOriginalStorageKey,
  buildTemporaryStorageKey,
} from "./storage-key";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";
const ASSET_ID = "123e4567-e89b-42d3-a456-426614174001";

describe("buildOriginalStorageKey", () => {
  it("builds the documented originals/ shape", () => {
    expect(buildOriginalStorageKey(PROJECT_ID, ASSET_ID, "png")).toBe(
      `originals/${PROJECT_ID}/${ASSET_ID}/original.png`,
    );
  });

  it("rejects a project id containing a path separator", () => {
    expect(() => buildOriginalStorageKey("../escape", ASSET_ID, "png")).toThrow(
      InvalidImagePathError,
    );
  });
});

describe("buildDerivedStorageKey", () => {
  it("builds the documented derived/ shape", () => {
    expect(buildDerivedStorageKey(PROJECT_ID, ASSET_ID, "abc123", "webp")).toBe(
      `derived/${PROJECT_ID}/${ASSET_ID}/abc123.webp`,
    );
  });

  it("isolates keys between different projects for the same asset id", () => {
    const otherProjectId = "123e4567-e89b-42d3-a456-426614174099";
    const keyA = buildDerivedStorageKey(PROJECT_ID, ASSET_ID, "hash1", "png");
    const keyB = buildDerivedStorageKey(
      otherProjectId,
      ASSET_ID,
      "hash1",
      "png",
    );
    expect(keyA).not.toBe(keyB);
  });
});

describe("buildTemporaryStorageKey", () => {
  it("builds the documented temporary/ shape", () => {
    expect(
      buildTemporaryStorageKey(PROJECT_ID, "job-1", "generated-name"),
    ).toBe(`temporary/${PROJECT_ID}/job-1/generated-name`);
  });

  it("rejects a generated name containing a traversal attempt", () => {
    expect(() =>
      buildTemporaryStorageKey(PROJECT_ID, "job-1", "../../etc/passwd"),
    ).toThrow(InvalidImagePathError);
  });
});

describe("buildExportStorageKey", () => {
  it("builds the documented exports/ shape", () => {
    expect(buildExportStorageKey(PROJECT_ID, "export-1")).toBe(
      `exports/${PROJECT_ID}/export-1.zip`,
    );
  });
});

describe("storage keys never embed user-controlled raw paths", () => {
  it("rejects slashes anywhere in an identifier segment", () => {
    expect(() =>
      buildOriginalStorageKey(PROJECT_ID, "asset/with/slashes", "jpg"),
    ).toThrow(InvalidImagePathError);
  });
});
