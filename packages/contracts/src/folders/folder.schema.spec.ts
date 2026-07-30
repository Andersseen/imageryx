import { describe, expect, it } from "vitest";
import { createFolderInputSchema } from "./folder.contracts";
import { folderSchema } from "./folder.schema";

const VALID_FOLDER = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  projectId: "123e4567-e89b-42d3-a456-426614174001",
  parentId: null,
  name: "Profile",
  slug: "profile",
  path: "profile",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("folderSchema", () => {
  it("accepts a valid root-level folder", () => {
    expect(folderSchema.safeParse(VALID_FOLDER).success).toBe(true);
  });

  it("accepts a valid nested path", () => {
    expect(
      folderSchema.safeParse({
        ...VALID_FOLDER,
        path: "projects/angular-lab/cover",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["leading separator", "/profile"],
    ["trailing separator", "profile/"],
    ["repeated separator", "projects//angular-lab"],
    ["traversal segment", "../secret"],
  ])("rejects a path with %s", (_label, path) => {
    expect(folderSchema.safeParse({ ...VALID_FOLDER, path }).success).toBe(
      false,
    );
  });
});

describe("createFolderInputSchema", () => {
  it("requires a project id", () => {
    expect(createFolderInputSchema.safeParse({ name: "Profile" }).success).toBe(
      false,
    );
  });

  it("accepts a nested folder with an explicit parent", () => {
    expect(
      createFolderInputSchema.safeParse({
        projectId: "123e4567-e89b-42d3-a456-426614174001",
        parentId: "123e4567-e89b-42d3-a456-426614174000",
        name: "Cover",
      }).success,
    ).toBe(true);
  });
});
