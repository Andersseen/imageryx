import { describe, expect, it } from "vitest";
import { slugify, validateProjectForm } from "./project-form";

describe("slugify", () => {
  it("lowercases and hyphenates a display name", () => {
    expect(slugify("Angular Lab")).toBe("angular-lab");
    expect(slugify("  Andersseen   Portfolio  ")).toBe("andersseen-portfolio");
  });

  it("strips Latin diacritics rather than dropping the letter", () => {
    expect(slugify("Café Photos")).toBe("cafe-photos");
  });

  it("collapses runs of punctuation into a single hyphen", () => {
    expect(slugify("A -- B __ C!!")).toBe("a-b-c");
  });

  it("never emits a leading or trailing hyphen", () => {
    expect(slugify("!!Hello!!")).toBe("hello");
  });

  it("caps the length", () => {
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it("returns an empty string when nothing survives normalization", () => {
    // Non-Latin scripts have no decomposition to fall back on — documented behaviour, not a bug.
    expect(slugify("日本語")).toBe("");
  });
});

describe("validateProjectForm", () => {
  it("accepts a well-formed project", () => {
    expect(
      validateProjectForm(
        { name: "Angular Lab", slug: "angular-lab" },
        { requireSlug: true },
      ),
    ).toEqual({});
  });

  it("requires a non-blank name", () => {
    expect(
      validateProjectForm({ name: "   ", slug: "x" }, { requireSlug: true })
        .name,
    ).toBeTruthy();
  });

  it("rejects an over-long name", () => {
    expect(
      validateProjectForm(
        { name: "x".repeat(200), slug: "x" },
        { requireSlug: true },
      ).name,
    ).toContain("120");
  });

  it("rejects a malformed slug", () => {
    for (const slug of [
      "Angular Lab",
      "UPPER",
      "-leading",
      "trailing-",
      "double--hyphen",
      "a_b",
    ]) {
      expect(
        validateProjectForm({ name: "Valid", slug }, { requireSlug: true })
          .slug,
        `expected "${slug}" to be rejected`,
      ).toBeTruthy();
    }
  });

  it("accepts digits and single hyphens in a slug", () => {
    expect(
      validateProjectForm(
        { name: "Valid", slug: "project-2026-v2" },
        { requireSlug: true },
      ).slug,
    ).toBeUndefined();
  });

  it("skips slug validation in edit mode, where the slug is not editable", () => {
    expect(
      validateProjectForm({ name: "Valid", slug: "" }, { requireSlug: false }),
    ).toEqual({});
  });

  it("does not attempt to validate uniqueness, which only the API can know", () => {
    // Two identical inputs both validate — a duplicate slug is a 409 from the API, by design.
    const input = { name: "Duplicate", slug: "duplicate" };
    expect(validateProjectForm(input, { requireSlug: true })).toEqual({});
    expect(validateProjectForm(input, { requireSlug: true })).toEqual({});
  });
});
