import { describe, expect, it } from "vitest";
import { generateAssetPath } from "./asset-path";

describe("generateAssetPath", () => {
  it("joins a folder path and asset slug", () => {
    expect(generateAssetPath("profile", "andrii")).toBe("profile/andrii");
  });

  it("supports a root-level asset (empty folder path)", () => {
    expect(generateAssetPath("", "hero")).toBe("hero");
  });

  it("appends a numeric suffix for conflict resolution", () => {
    expect(generateAssetPath("projects/angular-lab", "cover", 2)).toBe(
      "projects/angular-lab/cover-2",
    );
  });

  it("does not append a suffix of 0", () => {
    expect(generateAssetPath("projects/angular-lab", "cover", 0)).toBe(
      "projects/angular-lab/cover",
    );
  });
});
