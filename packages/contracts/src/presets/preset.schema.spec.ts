import { describe, expect, it } from "vitest";
import { createPresetInputSchema } from "./preset.contracts";
import { MAX_OPERATIONS_PER_PRESET, presetSchema } from "./preset.schema";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";

const RESIZE_OP = {
  type: "resize" as const,
  width: 320,
  height: 320,
  fit: "cover" as const,
  withoutEnlargement: true,
};

describe("presetSchema", () => {
  it("accepts a valid preset shaped like the Thumbnail system preset", () => {
    const result = presetSchema.safeParse({
      id: "123e4567-e89b-42d3-a456-426614174001",
      projectId: PROJECT_ID,
      name: "Thumbnail",
      slug: "thumbnail",
      description: null,
      operations: [RESIZE_OP],
      outputFormat: "auto",
      quality: 75,
      isSystem: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a preset with more than the maximum operations", () => {
    const operations = Array.from(
      { length: MAX_OPERATIONS_PER_PRESET + 1 },
      () => RESIZE_OP,
    );
    const result = createPresetInputSchema.safeParse({
      projectId: PROJECT_ID,
      name: "Too Many",
      operations,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a preset at exactly the maximum operation count", () => {
    const operations = Array.from(
      { length: MAX_OPERATIONS_PER_PRESET },
      () => RESIZE_OP,
    );
    const result = createPresetInputSchema.safeParse({
      projectId: PROJECT_ID,
      name: "At Limit",
      operations,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an operation that is individually invalid inside the array", () => {
    const result = createPresetInputSchema.safeParse({
      projectId: PROJECT_ID,
      name: "Bad Op",
      operations: [{ type: "resize", fit: "cover" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("createPresetInputSchema", () => {
  it("defaults outputFormat to auto", () => {
    const result = createPresetInputSchema.parse({
      projectId: PROJECT_ID,
      name: "Content",
      operations: [RESIZE_OP],
    });
    expect(result.outputFormat).toBe("auto");
  });

  it("accepts an empty operations array (original-delivery policy)", () => {
    expect(
      createPresetInputSchema.safeParse({
        projectId: PROJECT_ID,
        name: "Original",
        operations: [],
      }).success,
    ).toBe(true);
  });
});
