import type {
  AssetSortField,
  DeletedState,
  ProcessingStatus,
} from "@imageryx/contracts";

export type AssetViewMode = "grid" | "table";

/**
 * Every user-controllable dimension of the library view, in one serializable object.
 *
 * This is the single source of truth the URL, the filter bar, and the SDK call all derive from.
 * Keeping it a plain object (rather than scattered signals) is what makes the whole view state
 * shareable as a link and restorable on reload without a second mapping layer to keep in sync.
 */
export interface AssetQuery {
  search: string;
  folderId: string | null;
  /** `null` means "no folder filter"; the empty string means "root only" — a real distinction the API honours. */
  tag: string | null;
  processingStatus: ProcessingStatus | null;
  visibility: "public" | "private" | null;
  deleted: DeletedState;
  sortField: AssetSortField;
  sortDirection: "asc" | "desc";
  page: number;
  pageSize: number;
  view: AssetViewMode;
}

export const DEFAULT_PAGE_SIZE = 24;

export const DEFAULT_ASSET_QUERY: AssetQuery = {
  search: "",
  folderId: null,
  tag: null,
  processingStatus: null,
  visibility: null,
  deleted: "active",
  sortField: "createdAt",
  sortDirection: "desc",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  view: "grid",
};

const SORT_FIELDS: readonly AssetSortField[] = [
  "createdAt",
  "updatedAt",
  "name",
  "sizeBytes",
];
const PROCESSING_STATUSES: readonly ProcessingStatus[] = [
  "pending",
  "processing",
  "ready",
  "failed",
];
const DELETED_STATES: readonly DeletedState[] = ["active", "deleted", "all"];
const PAGE_SIZES: readonly number[] = [12, 24, 48, 96];

function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function positiveInt(
  value: string | null | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Rebuilds a query from URL params, falling back to the default for anything absent or invalid.
 *
 * Unknown values are silently replaced rather than rejected: a hand-edited or stale link should
 * still render the library, not an error page. The API re-validates every one of these anyway
 * (`parseAssetFilter` in api-worker), so a bad value can never reach the database.
 */
export function parseAssetQuery(
  params: Record<string, string | null | undefined>,
): AssetQuery {
  const folderIdRaw = params["folder"];
  return {
    search: (params["q"] ?? "").trim(),
    // "" is meaningful (root-level assets only) and must survive the round trip, so only a
    // genuinely absent param becomes null.
    folderId:
      folderIdRaw === undefined || folderIdRaw === null ? null : folderIdRaw,
    tag: params["tag"]?.trim() || null,
    processingStatus: oneOf(params["status"], PROCESSING_STATUSES),
    visibility: oneOf(params["visibility"], ["public", "private"] as const),
    deleted:
      oneOf(params["deleted"], DELETED_STATES) ?? DEFAULT_ASSET_QUERY.deleted,
    sortField:
      oneOf(params["sort"], SORT_FIELDS) ?? DEFAULT_ASSET_QUERY.sortField,
    sortDirection: params["dir"] === "asc" ? "asc" : "desc",
    page: positiveInt(params["page"], DEFAULT_ASSET_QUERY.page),
    pageSize: PAGE_SIZES.includes(
      positiveInt(params["size"], DEFAULT_PAGE_SIZE),
    )
      ? positiveInt(params["size"], DEFAULT_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
    view: params["view"] === "table" ? "table" : "grid",
  };
}

/**
 * The inverse of `parseAssetQuery`, emitting only non-default values so a pristine library view
 * has a clean `/library` URL instead of a dozen redundant params.
 */
export function toUrlParams(query: AssetQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.search) params["q"] = query.search;
  if (query.folderId !== null) params["folder"] = query.folderId;
  if (query.tag) params["tag"] = query.tag;
  if (query.processingStatus) params["status"] = query.processingStatus;
  if (query.visibility) params["visibility"] = query.visibility;
  if (query.deleted !== DEFAULT_ASSET_QUERY.deleted)
    params["deleted"] = query.deleted;
  if (query.sortField !== DEFAULT_ASSET_QUERY.sortField)
    params["sort"] = query.sortField;
  if (query.sortDirection !== DEFAULT_ASSET_QUERY.sortDirection)
    params["dir"] = query.sortDirection;
  if (query.page !== 1) params["page"] = String(query.page);
  if (query.pageSize !== DEFAULT_PAGE_SIZE)
    params["size"] = String(query.pageSize);
  if (query.view !== DEFAULT_ASSET_QUERY.view) params["view"] = query.view;
  return params;
}

/**
 * Maps the view query onto `GET /v1/assets`' parameter names. `view` never crosses this boundary
 * — it is presentation state, and sending it would make two visually different renders of
 * identical data look like different requests to any cache keyed on the URL.
 */
export function toListParams(
  query: AssetQuery,
): Record<string, string | number | boolean | undefined> {
  return {
    search: query.search || undefined,
    folderId: query.folderId ?? undefined,
    tag: query.tag ?? undefined,
    processingStatus: query.processingStatus ?? undefined,
    visibility: query.visibility ?? undefined,
    deleted: query.deleted,
    sortField: query.sortField,
    sortDirection: query.sortDirection,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** True when anything other than paging/sorting/view is narrowing the result set. */
export function hasActiveFilters(query: AssetQuery): boolean {
  return (
    query.search !== "" ||
    query.folderId !== null ||
    query.tag !== null ||
    query.processingStatus !== null ||
    query.visibility !== null ||
    query.deleted !== DEFAULT_ASSET_QUERY.deleted
  );
}

/** Clears filters but deliberately preserves sort, page size, and view — those are workspace preferences, not a filter. */
export function clearFilters(query: AssetQuery): AssetQuery {
  return {
    ...DEFAULT_ASSET_QUERY,
    sortField: query.sortField,
    sortDirection: query.sortDirection,
    pageSize: query.pageSize,
    view: query.view,
  };
}

/**
 * Applies a change and resets to page 1 unless the change *is* the page.
 * Without this, narrowing a filter while on page 5 of 6 lands on an empty page that looks like
 * "no results" when there are plenty.
 */
export function applyQueryChange(
  query: AssetQuery,
  change: Partial<AssetQuery>,
): AssetQuery {
  const next = { ...query, ...change };
  const onlyPaginationChanged =
    change.page !== undefined && Object.keys(change).length === 1;
  return onlyPaginationChanged ? next : { ...next, page: change.page ?? 1 };
}

export const ASSET_PAGE_SIZES = PAGE_SIZES;
export const ASSET_SORT_FIELDS = SORT_FIELDS;
