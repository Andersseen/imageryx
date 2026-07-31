import type {
  ProcessingJobStatus,
  ProcessingJobType,
} from "@imageryx/contracts";

/** The processing list view's full state, driven by the URL — same pattern as `AssetQuery`. */
export interface ProcessingQuery {
  status: ProcessingJobStatus | null;
  type: ProcessingJobType | null;
  page: number;
  pageSize: number;
}

export const DEFAULT_PROCESSING_PAGE_SIZE = 24;

export const DEFAULT_PROCESSING_QUERY: ProcessingQuery = {
  status: null,
  type: null,
  page: 1,
  pageSize: DEFAULT_PROCESSING_PAGE_SIZE,
};

const STATUSES: readonly ProcessingJobStatus[] = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
];
const TYPES: readonly ProcessingJobType[] = [
  "inspect-metadata",
  "generate-variant",
  "extract-placeholder",
  "strip-metadata",
  "copy-provider-result",
  "delete-object",
  "batch-operation",
];
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

/** Rebuilds a query from URL params, silently falling back to defaults for anything invalid — the API re-validates every one of these too. */
export function parseProcessingQuery(
  params: Record<string, string | null | undefined>,
): ProcessingQuery {
  const size = positiveInt(params["size"], DEFAULT_PROCESSING_PAGE_SIZE);
  return {
    status: oneOf(params["status"], STATUSES),
    type: oneOf(params["type"], TYPES),
    page: positiveInt(params["page"], DEFAULT_PROCESSING_QUERY.page),
    pageSize: PAGE_SIZES.includes(size) ? size : DEFAULT_PROCESSING_PAGE_SIZE,
  };
}

export function toUrlParams(query: ProcessingQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.status) params["status"] = query.status;
  if (query.type) params["type"] = query.type;
  if (query.page !== 1) params["page"] = String(query.page);
  if (query.pageSize !== DEFAULT_PROCESSING_PAGE_SIZE)
    params["size"] = String(query.pageSize);
  return params;
}

export function toListParams(
  query: ProcessingQuery,
): Record<string, string | number | undefined> {
  return {
    status: query.status ?? undefined,
    type: query.type ?? undefined,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function hasActiveFilters(query: ProcessingQuery): boolean {
  return query.status !== null || query.type !== null;
}

export function clearFilters(query: ProcessingQuery): ProcessingQuery {
  return { ...DEFAULT_PROCESSING_QUERY, pageSize: query.pageSize };
}

/** Applies a change and resets to page 1 unless the change *is* the page — narrowing a filter from page 5 should not land on a now-empty page. */
export function applyQueryChange(
  query: ProcessingQuery,
  change: Partial<ProcessingQuery>,
): ProcessingQuery {
  const next = { ...query, ...change };
  const onlyPaginationChanged =
    change.page !== undefined && Object.keys(change).length === 1;
  return onlyPaginationChanged ? next : { ...next, page: change.page ?? 1 };
}

export const PROCESSING_STATUSES = STATUSES;
export const PROCESSING_TYPES = TYPES;
export const PROCESSING_PAGE_SIZES = PAGE_SIZES;
