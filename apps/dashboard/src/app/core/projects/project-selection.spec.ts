import type { ProjectSummary } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import {
  resolveSelectedProjectId,
  sortProjectsForSwitcher,
} from "./project-selection";

function project(id: string, name: string, isDefault = false): ProjectSummary {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    isDefault,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    assetCount: 0,
    folderCount: 0,
    presetCount: 0,
    totalOriginalBytes: 0,
    latestActivity: null,
  };
}

describe("resolveSelectedProjectId", () => {
  const projects = [
    project("a", "Alpha"),
    project("b", "Beta", true),
    project("c", "Gamma"),
  ];

  it("returns null when there are no projects at all", () => {
    expect(resolveSelectedProjectId([], "a", "b")).toBeNull();
  });

  it("honours an explicit request above everything else", () => {
    expect(resolveSelectedProjectId(projects, "c", "a")).toBe("c");
  });

  it("falls back to the remembered project when nothing was explicitly requested", () => {
    expect(resolveSelectedProjectId(projects, null, "c")).toBe("c");
  });

  it("skips a requested project that no longer exists", () => {
    // A stale bookmark must not leave the dashboard pointing at nothing.
    expect(resolveSelectedProjectId(projects, "deleted-id", "a")).toBe("a");
  });

  it("skips a remembered project that no longer exists", () => {
    expect(resolveSelectedProjectId(projects, null, "deleted-id")).toBe("b");
  });

  it("prefers the default project when there is nothing to restore", () => {
    expect(resolveSelectedProjectId(projects, null, null)).toBe("b");
  });

  it("falls back to the first project when none is flagged default", () => {
    const noDefault = [project("a", "Alpha"), project("c", "Gamma")];
    expect(resolveSelectedProjectId(noDefault, null, null)).toBe("a");
  });
});

describe("sortProjectsForSwitcher", () => {
  it("puts the default project first, then sorts by name", () => {
    const sorted = sortProjectsForSwitcher([
      project("c", "Gamma"),
      project("a", "Alpha"),
      project("b", "Zeta", true),
    ]);
    expect(sorted.map((p) => p.name)).toEqual(["Zeta", "Alpha", "Gamma"]);
  });

  it("does not mutate the input array", () => {
    const input = [project("c", "Gamma"), project("a", "Alpha")];
    sortProjectsForSwitcher(input);
    expect(input.map((p) => p.id)).toEqual(["c", "a"]);
  });
});
