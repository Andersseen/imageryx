import { describe, expect, it } from "vitest";
import {
  applyQueryChange,
  clearFilters,
  DEFAULT_PROCESSING_QUERY,
  hasActiveFilters,
  parseProcessingQuery,
  toListParams,
  toUrlParams,
} from "./processing-query";

describe("parseProcessingQuery", () => {
  it("returns the defaults for an empty param set", () => {
    expect(parseProcessingQuery({})).toEqual(DEFAULT_PROCESSING_QUERY);
  });

  it("reads status, type, page and size", () => {
    expect(
      parseProcessingQuery({
        status: "failed",
        type: "generate-variant",
        page: "3",
        size: "48",
      }),
    ).toEqual({
      status: "failed",
      type: "generate-variant",
      page: 3,
      pageSize: 48,
    });
  });

  it("falls back to defaults for invalid enum values instead of throwing", () => {
    expect(
      parseProcessingQuery({ status: "not-a-status", type: "not-a-type" }),
    ).toEqual(DEFAULT_PROCESSING_QUERY);
  });

  it("falls back to the default page size for a size the API doesn't offer", () => {
    expect(parseProcessingQuery({ size: "13" }).pageSize).toBe(24);
  });
});

describe("toUrlParams", () => {
  it("omits every param at its default", () => {
    expect(toUrlParams(DEFAULT_PROCESSING_QUERY)).toEqual({});
  });

  it("round-trips through parseProcessingQuery", () => {
    const query = {
      status: "queued" as const,
      type: "batch-operation" as const,
      page: 2,
      pageSize: 96,
    };
    expect(parseProcessingQuery(toUrlParams(query))).toEqual(query);
  });
});

describe("toListParams", () => {
  it("maps null filters to undefined for the SDK call", () => {
    expect(toListParams(DEFAULT_PROCESSING_QUERY)).toEqual({
      status: undefined,
      type: undefined,
      page: 1,
      pageSize: 24,
    });
  });
});

describe("hasActiveFilters", () => {
  it("is false with no filters set", () => {
    expect(hasActiveFilters(DEFAULT_PROCESSING_QUERY)).toBe(false);
  });

  it("is true once status or type narrows the list", () => {
    expect(
      hasActiveFilters({ ...DEFAULT_PROCESSING_QUERY, status: "failed" }),
    ).toBe(true);
    expect(
      hasActiveFilters({ ...DEFAULT_PROCESSING_QUERY, type: "delete-object" }),
    ).toBe(true);
  });
});

describe("clearFilters", () => {
  it("resets filters and page but preserves page size", () => {
    const query = {
      status: "failed" as const,
      type: "delete-object" as const,
      page: 4,
      pageSize: 96,
    };
    expect(clearFilters(query)).toEqual({
      ...DEFAULT_PROCESSING_QUERY,
      pageSize: 96,
    });
  });
});

describe("applyQueryChange", () => {
  it("resets to page 1 when a filter changes", () => {
    const query = { ...DEFAULT_PROCESSING_QUERY, page: 5 };
    expect(applyQueryChange(query, { status: "failed" }).page).toBe(1);
  });

  it("keeps the requested page when only the page changes", () => {
    const query = DEFAULT_PROCESSING_QUERY;
    expect(applyQueryChange(query, { page: 3 })).toEqual({ ...query, page: 3 });
  });
});
