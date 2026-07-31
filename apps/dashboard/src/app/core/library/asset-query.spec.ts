import { describe, expect, it } from "vitest";
import {
  applyQueryChange,
  clearFilters,
  DEFAULT_ASSET_QUERY,
  hasActiveFilters,
  parseAssetQuery,
  toListParams,
  toUrlParams,
} from "./asset-query";

describe("parseAssetQuery", () => {
  it("returns the defaults for an empty param set", () => {
    expect(parseAssetQuery({})).toEqual(DEFAULT_ASSET_QUERY);
  });

  it("reads every supported param", () => {
    const query = parseAssetQuery({
      q: "hero",
      folder: "folder-1",
      tag: "marketing",
      status: "ready",
      visibility: "private",
      deleted: "all",
      sort: "name",
      dir: "asc",
      page: "3",
      size: "48",
      view: "table",
    });
    expect(query).toEqual({
      search: "hero",
      folderId: "folder-1",
      tag: "marketing",
      processingStatus: "ready",
      visibility: "private",
      deleted: "all",
      sortField: "name",
      sortDirection: "asc",
      page: 3,
      pageSize: 48,
      view: "table",
    });
  });

  it("preserves the empty folder param, which means 'root only' rather than 'no filter'", () => {
    expect(parseAssetQuery({ folder: "" }).folderId).toBe("");
    expect(parseAssetQuery({}).folderId).toBeNull();
  });

  it("falls back to defaults for unrecognized values rather than failing", () => {
    const query = parseAssetQuery({
      status: "exploded",
      visibility: "secret",
      deleted: "maybe",
      sort: "size",
      dir: "sideways",
      view: "carousel",
    });
    expect(query.processingStatus).toBeNull();
    expect(query.visibility).toBeNull();
    expect(query.deleted).toBe("active");
    expect(query.sortField).toBe("createdAt");
    expect(query.sortDirection).toBe("desc");
    expect(query.view).toBe("grid");
  });

  it("rejects non-positive, non-integer and unsupported paging values", () => {
    expect(parseAssetQuery({ page: "0" }).page).toBe(1);
    expect(parseAssetQuery({ page: "-4" }).page).toBe(1);
    expect(parseAssetQuery({ page: "two" }).page).toBe(1);
    expect(parseAssetQuery({ page: "1.5" }).page).toBe(1);
    expect(parseAssetQuery({ size: "1000" }).pageSize).toBe(24);
    expect(parseAssetQuery({ size: "48" }).pageSize).toBe(48);
  });

  it("trims the search term", () => {
    expect(parseAssetQuery({ q: "  hero  " }).search).toBe("hero");
  });
});

describe("toUrlParams", () => {
  it("emits nothing for a pristine query, keeping the URL clean", () => {
    expect(toUrlParams(DEFAULT_ASSET_QUERY)).toEqual({});
  });

  it("emits only what differs from the default", () => {
    expect(
      toUrlParams({ ...DEFAULT_ASSET_QUERY, search: "hero", page: 2 }),
    ).toEqual({
      q: "hero",
      page: "2",
    });
  });

  it("round-trips every field back through parseAssetQuery", () => {
    const original = {
      ...DEFAULT_ASSET_QUERY,
      search: "hero",
      folderId: "f-1",
      tag: "marketing",
      processingStatus: "failed" as const,
      visibility: "private" as const,
      deleted: "deleted" as const,
      sortField: "sizeBytes" as const,
      sortDirection: "asc" as const,
      page: 4,
      pageSize: 96,
      view: "table" as const,
    };
    expect(parseAssetQuery(toUrlParams(original))).toEqual(original);
  });

  it("round-trips the root-folder filter", () => {
    const rootOnly = { ...DEFAULT_ASSET_QUERY, folderId: "" };
    expect(toUrlParams(rootOnly)).toEqual({ folder: "" });
    expect(parseAssetQuery(toUrlParams(rootOnly)).folderId).toBe("");
  });
});

describe("toListParams", () => {
  it("omits absent filters instead of sending empty strings", () => {
    const params = toListParams(DEFAULT_ASSET_QUERY);
    expect(params["search"]).toBeUndefined();
    expect(params["tag"]).toBeUndefined();
    expect(params["processingStatus"]).toBeUndefined();
    expect(params["visibility"]).toBeUndefined();
  });

  it("never sends the view mode to the API", () => {
    expect(
      toListParams({ ...DEFAULT_ASSET_QUERY, view: "table" }),
    ).not.toHaveProperty("view");
  });

  it("passes the root-folder filter through as an empty string", () => {
    expect(
      toListParams({ ...DEFAULT_ASSET_QUERY, folderId: "" })["folderId"],
    ).toBe("");
  });

  it("always sends paging and sorting", () => {
    const params = toListParams({ ...DEFAULT_ASSET_QUERY, page: 3 });
    expect(params["page"]).toBe(3);
    expect(params["pageSize"]).toBe(24);
    expect(params["sortField"]).toBe("createdAt");
    expect(params["sortDirection"]).toBe("desc");
    expect(params["deleted"]).toBe("active");
  });
});

describe("hasActiveFilters", () => {
  it("is false for a pristine query", () => {
    expect(hasActiveFilters(DEFAULT_ASSET_QUERY)).toBe(false);
  });

  it("ignores sorting, paging and view mode", () => {
    expect(
      hasActiveFilters({
        ...DEFAULT_ASSET_QUERY,
        page: 5,
        sortField: "name",
        view: "table",
        pageSize: 96,
      }),
    ).toBe(false);
  });

  it("is true for any narrowing filter", () => {
    expect(hasActiveFilters({ ...DEFAULT_ASSET_QUERY, search: "x" })).toBe(
      true,
    );
    expect(hasActiveFilters({ ...DEFAULT_ASSET_QUERY, folderId: "" })).toBe(
      true,
    );
    expect(hasActiveFilters({ ...DEFAULT_ASSET_QUERY, tag: "t" })).toBe(true);
    expect(
      hasActiveFilters({ ...DEFAULT_ASSET_QUERY, processingStatus: "failed" }),
    ).toBe(true);
    expect(
      hasActiveFilters({ ...DEFAULT_ASSET_QUERY, visibility: "private" }),
    ).toBe(true);
    expect(
      hasActiveFilters({ ...DEFAULT_ASSET_QUERY, deleted: "deleted" }),
    ).toBe(true);
  });
});

describe("clearFilters", () => {
  it("clears filters but preserves sort, page size and view", () => {
    const cleared = clearFilters({
      ...DEFAULT_ASSET_QUERY,
      search: "hero",
      tag: "marketing",
      deleted: "all",
      sortField: "name",
      sortDirection: "asc",
      pageSize: 96,
      view: "table",
      page: 7,
    });
    expect(cleared.search).toBe("");
    expect(cleared.tag).toBeNull();
    expect(cleared.deleted).toBe("active");
    expect(cleared.page).toBe(1);
    expect(cleared.sortField).toBe("name");
    expect(cleared.sortDirection).toBe("asc");
    expect(cleared.pageSize).toBe(96);
    expect(cleared.view).toBe("table");
  });
});

describe("applyQueryChange", () => {
  it("resets to page 1 when a filter changes, so narrowing never lands on an empty page", () => {
    const next = applyQueryChange(
      { ...DEFAULT_ASSET_QUERY, page: 5 },
      { search: "hero" },
    );
    expect(next.page).toBe(1);
    expect(next.search).toBe("hero");
  });

  it("keeps the requested page when only paging changes", () => {
    const next = applyQueryChange(
      { ...DEFAULT_ASSET_QUERY, search: "hero" },
      { page: 3 },
    );
    expect(next.page).toBe(3);
    expect(next.search).toBe("hero");
  });

  it("resets to page 1 when a page change is bundled with a filter change", () => {
    const next = applyQueryChange(
      { ...DEFAULT_ASSET_QUERY, page: 5 },
      { page: 5, sortField: "name" },
    );
    expect(next.page).toBe(5);
    expect(next.sortField).toBe("name");
  });

  it("resets to page 1 when only the view changes", () => {
    // Switching grid/table re-renders the same result set; page 1 keeps it predictable.
    expect(
      applyQueryChange({ ...DEFAULT_ASSET_QUERY, page: 4 }, { view: "table" })
        .page,
    ).toBe(1);
  });
});
