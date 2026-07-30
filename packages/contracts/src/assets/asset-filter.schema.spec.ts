import { describe, expect, it } from "vitest";
import { assetFilterSchema } from "./asset-filter.schema";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("assetFilterSchema", () => {
  it("applies pagination and deleted-state defaults", () => {
    const result = assetFilterSchema.parse({ projectId: PROJECT_ID });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(24);
    expect(result.deleted).toBe("active");
    expect(result.sortField).toBe("createdAt");
    expect(result.sortDirection).toBe("desc");
  });

  it("accepts a full filter combination", () => {
    const result = assetFilterSchema.safeParse({
      projectId: PROJECT_ID,
      mimeType: "image/png",
      extension: "png",
      visibility: "public",
      processingStatus: "ready",
      search: "hero",
      minWidth: 100,
      maxWidth: 2000,
      deleted: "all",
    });
    expect(result.success).toBe(true);
  });

  it("rejects minWidth greater than maxWidth", () => {
    expect(
      assetFilterSchema.safeParse({
        projectId: PROJECT_ID,
        minWidth: 500,
        maxWidth: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects minHeight greater than maxHeight", () => {
    expect(
      assetFilterSchema.safeParse({
        projectId: PROJECT_ID,
        minHeight: 500,
        maxHeight: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects createdAfter later than createdBefore", () => {
    expect(
      assetFilterSchema.safeParse({
        projectId: PROJECT_ID,
        createdAfter: "2026-02-01T00:00:00.000Z",
        createdBefore: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects an unsupported MIME type", () => {
    expect(
      assetFilterSchema.safeParse({
        projectId: PROJECT_ID,
        mimeType: "image/bmp",
      }).success,
    ).toBe(false);
  });

  it("rejects a pageSize above the maximum", () => {
    expect(
      assetFilterSchema.safeParse({ projectId: PROJECT_ID, pageSize: 101 })
        .success,
    ).toBe(false);
  });
});
