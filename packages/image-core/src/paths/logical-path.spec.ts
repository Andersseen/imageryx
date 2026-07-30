import { describe, expect, it } from "vitest";
import { InvalidImagePathError } from "../errors/domain-errors";
import {
  joinLogicalPath,
  normalizeLogicalPath,
  validateLogicalPath,
} from "./logical-path";

describe("normalizeLogicalPath", () => {
  it("accepts valid nested paths", () => {
    expect(normalizeLogicalPath("profile/andrii")).toBe("profile/andrii");
    expect(normalizeLogicalPath("projects/angular-lab/cover")).toBe(
      "projects/angular-lab/cover",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeLogicalPath("  profile/andrii  ")).toBe("profile/andrii");
  });

  it("treats the empty string as the root", () => {
    expect(normalizeLogicalPath("")).toBe("");
  });

  it("rejects a leading slash (absolute path)", () => {
    expect(() => normalizeLogicalPath("/profile")).toThrow(
      InvalidImagePathError,
    );
  });

  it("rejects a trailing slash", () => {
    expect(() => normalizeLogicalPath("profile/")).toThrow(
      InvalidImagePathError,
    );
  });

  it("rejects repeated separators", () => {
    expect(() => normalizeLogicalPath("projects//angular-lab")).toThrow(
      InvalidImagePathError,
    );
  });

  it('rejects a "." segment', () => {
    expect(() => normalizeLogicalPath("profile/./andrii")).toThrow(
      InvalidImagePathError,
    );
  });

  it('rejects a ".." segment', () => {
    expect(() => normalizeLogicalPath("profile/../secret")).toThrow(
      InvalidImagePathError,
    );
  });

  it("rejects backslashes", () => {
    expect(() => normalizeLogicalPath("profile\\andrii")).toThrow(
      InvalidImagePathError,
    );
  });

  it("rejects null bytes", () => {
    expect(() => normalizeLogicalPath("profile\0andrii")).toThrow(
      InvalidImagePathError,
    );
  });

  it("rejects percent-encoded traversal sequences", () => {
    expect(() => normalizeLogicalPath("profile/%2e%2e/secret")).toThrow(
      InvalidImagePathError,
    );
  });

  it("rejects an empty segment produced by a leading separator group", () => {
    expect(() => normalizeLogicalPath("//profile")).toThrow(
      InvalidImagePathError,
    );
  });
});

describe("validateLogicalPath", () => {
  it("does not throw for an already-normalized path", () => {
    expect(() => validateLogicalPath("profile/andrii")).not.toThrow();
  });

  it("throws for a path that is not normalized", () => {
    expect(() => validateLogicalPath("profile/andrii/")).toThrow(
      InvalidImagePathError,
    );
  });
});

describe("joinLogicalPath", () => {
  it("joins segments with a single separator", () => {
    expect(joinLogicalPath("projects", "angular-lab", "cover")).toBe(
      "projects/angular-lab/cover",
    );
  });

  it("ignores empty segments", () => {
    expect(joinLogicalPath("projects", "", "cover")).toBe("projects/cover");
  });

  it("rejects a segment that is itself invalid", () => {
    expect(() => joinLogicalPath("projects", "..")).toThrow(
      InvalidImagePathError,
    );
  });
});
