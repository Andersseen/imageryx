import { describe, expect, it } from "vitest";
import {
  createProjectInputSchema,
  updateProjectInputSchema,
} from "./project.contracts";

describe("createProjectInputSchema", () => {
  it("accepts a minimal valid project", () => {
    expect(
      createProjectInputSchema.safeParse({ name: "Andersseen Portfolio" })
        .success,
    ).toBe(true);
  });

  it("trims the project name", () => {
    const result = createProjectInputSchema.parse({
      name: "  Andersseen Portfolio  ",
    });
    expect(result.name).toBe("Andersseen Portfolio");
  });

  it("rejects an empty name", () => {
    expect(createProjectInputSchema.safeParse({ name: "" }).success).toBe(
      false,
    );
  });

  it("rejects a name over the maximum length", () => {
    expect(
      createProjectInputSchema.safeParse({ name: "a".repeat(121) }).success,
    ).toBe(false);
  });

  it("rejects an invalid slug", () => {
    expect(
      createProjectInputSchema.safeParse({
        name: "Angular Lab",
        slug: "Angular Lab",
      }).success,
    ).toBe(false);
  });

  it("rejects a description over the maximum length", () => {
    expect(
      createProjectInputSchema.safeParse({
        name: "Angular Lab",
        description: "a".repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe("updateProjectInputSchema", () => {
  it("rejects an update with no fields besides id", () => {
    expect(
      updateProjectInputSchema.safeParse({
        id: "123e4567-e89b-42d3-a456-426614174000",
      }).success,
    ).toBe(false);
  });

  it("accepts an update with at least one field", () => {
    expect(
      updateProjectInputSchema.safeParse({
        id: "123e4567-e89b-42d3-a456-426614174000",
        name: "New Name",
      }).success,
    ).toBe(true);
  });
});
