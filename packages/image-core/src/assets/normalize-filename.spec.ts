import { describe, expect, it } from "vitest";
import { FILENAME_MAX_LENGTH, normalizeFilename } from "./normalize-filename";

describe("normalizeFilename", () => {
  it("trims, lowercases, and replaces spaces, preserving a lowercase extension", () => {
    expect(normalizeFilename(" My Hero Image.PNG ")).toEqual({
      slug: "my-hero-image.png",
      base: "my-hero-image",
      extension: "png",
    });
  });

  it("strips path separators and traversal segments instead of preserving them", () => {
    const result = normalizeFilename("../../secret.jpg");
    expect(result.slug).not.toContain("..");
    expect(result.slug).not.toContain("/");
    expect(result.extension).toBe("jpg");
    expect(result.slug).toBe("secret.jpg");
  });

  it("treats a hidden-style name with a real extension as a safe normalized name", () => {
    expect(normalizeFilename(".env.png")).toEqual({
      slug: "env.png",
      base: "env",
      extension: "png",
    });
  });

  it("falls back to a deterministic basename for non-Latin scripts with no ASCII slug", () => {
    const result = normalizeFilename("фото профілю.jpeg");
    expect(result.base).toBe("image");
    expect(result.slug).toBe("image.jpeg");
    expect(result.extension).toBe("jpeg");
  });

  it("collapses repeated dots inside the base name", () => {
    expect(normalizeFilename("photo...png")).toEqual({
      slug: "photo.png",
      base: "photo",
      extension: "png",
    });
  });

  it("treats a fully hidden filename with no extension as its own base name", () => {
    expect(normalizeFilename(".gitignore")).toEqual({
      slug: "gitignore",
      base: "gitignore",
      extension: null,
    });
  });

  it("falls back to the default basename when nothing ASCII-slug-able remains", () => {
    expect(normalizeFilename("!!!.png")).toEqual({
      slug: "image.png",
      base: "image",
      extension: "png",
    });
  });

  it("removes control characters", () => {
    const withControlChars = `photo${String.fromCharCode(1)}${String.fromCharCode(31)}.png`;
    expect(normalizeFilename(withControlChars).slug).toBe("photo.png");
  });

  it("truncates a base name longer than the maximum length while preserving the extension", () => {
    const longName = `${"a".repeat(300)}.png`;
    const result = normalizeFilename(longName);
    expect(result.slug.length).toBeLessThanOrEqual(FILENAME_MAX_LENGTH);
    expect(result.slug.endsWith(".png")).toBe(true);
  });

  it("prefers an explicitly claimed extension over one parsed from the raw name", () => {
    const result = normalizeFilename("photo.txt", "jpg");
    expect(result.extension).toBe("jpg");
    expect(result.slug).toBe("photo.jpg");
  });

  it("rejects an unsupported extension parsed from the raw name (returns null, not the raw value)", () => {
    expect(normalizeFilename("document.pdf").extension).toBeNull();
  });

  it("is deterministic for the same input", () => {
    expect(normalizeFilename("My Photo.JPG")).toEqual(
      normalizeFilename("My Photo.JPG"),
    );
  });
});
