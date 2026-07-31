import { describe, expect, it } from "vitest";
import { parseTags } from "./tags";

describe("parseTags", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseTags(" hero , marketing ,, ")).toEqual(["hero", "marketing"]);
  });

  it("de-duplicates", () => {
    expect(parseTags("hero, hero, Hero")).toEqual(["hero", "Hero"]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("   ")).toEqual([]);
  });
});
