import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationInputSchema,
} from "./pagination";

describe("paginationInputSchema", () => {
  it("applies defaults when nothing is provided", () => {
    const result = paginationInputSchema.parse({});
    expect(result).toEqual({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });
  });

  it("accepts a pageSize at the maximum", () => {
    expect(
      paginationInputSchema.safeParse({ page: 1, pageSize: MAX_PAGE_SIZE })
        .success,
    ).toBe(true);
  });

  it("rejects a pageSize above the maximum", () => {
    expect(
      paginationInputSchema.safeParse({ page: 1, pageSize: MAX_PAGE_SIZE + 1 })
        .success,
    ).toBe(false);
  });

  it("rejects a page below 1", () => {
    expect(
      paginationInputSchema.safeParse({ page: 0, pageSize: 24 }).success,
    ).toBe(false);
  });

  it("rejects a non-integer page", () => {
    expect(
      paginationInputSchema.safeParse({ page: 1.5, pageSize: 24 }).success,
    ).toBe(false);
  });
});
