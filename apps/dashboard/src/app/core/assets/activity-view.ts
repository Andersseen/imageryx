import type { AssetActivityEntry } from "@imageryx/sdk";

export interface ActivityView {
  entry: AssetActivityEntry;
  description: string;
  /** A same-page anchor this event is about, if any — a variant or processing job id from its metadata. */
  linkedVariantId: string | null;
  linkedJobId: string | null;
}

/**
 * The exact, closed set of asset-scoped events `AssetActivityRepository.record()` is ever called
 * with (see api-worker's asset/processing-job routes and processing-worker's job handlers) —
 * kept here as the single place that has to change if a future event is added, rather than
 * scattering `switch` cases across the timeline component.
 */
const DESCRIPTIONS: Record<
  string,
  (metadata: Record<string, unknown> | null) => string
> = {
  "asset.uploaded": (m) =>
    `Uploaded${filename(m) ? ` as "${filename(m)}"` : ""}`,
  "asset.metadata_inspected": (m) => {
    const dims =
      m && typeof m["width"] === "number" && typeof m["height"] === "number";
    return dims
      ? `Metadata inspected — ${m!["width"]} × ${m!["height"]}`
      : "Metadata inspected";
  },
  "asset.ready": () => "Ready for delivery",
  "asset.updated": (m) => {
    const fields = Array.isArray(m?.["fields"])
      ? (m["fields"] as string[])
      : [];
    return fields.length > 0 ? `Updated (${fields.join(", ")})` : "Updated";
  },
  "asset.moved": () => "Moved to a different folder",
  "asset.tags_changed": (m) => {
    const tags = Array.isArray(m?.["tags"]) ? (m["tags"] as string[]) : [];
    return tags.length > 0 ? `Tags set to: ${tags.join(", ")}` : "Tags changed";
  },
  "asset.deleted": () => "Soft-deleted",
  "asset.restored": () => "Restored",
  "variant.requested": () => "Variant requested",
  "variant.processing": () => "Variant processing started",
  "variant.ready": (m) =>
    m?.["simulated"]
      ? "Variant ready (simulated transformation)"
      : "Variant ready",
  "processing.failed": () => "Processing failed",
  "processing.retried": () => "Processing retried",
  "download.url_created": (m) => {
    const variant =
      typeof m?.["variant"] === "string" ? (m["variant"] as string) : null;
    return variant === "original" || variant === null
      ? "Signed download link created for the original"
      : "Signed download link created for a variant";
  },
};

function filename(metadata: Record<string, unknown> | null): string | null {
  return typeof metadata?.["originalFilename"] === "string"
    ? (metadata["originalFilename"] as string)
    : null;
}

export function describeActivity(entry: AssetActivityEntry): string {
  const describe = DESCRIPTIONS[entry.event];
  return describe ? describe(entry.metadata) : entry.event;
}

export function toActivityView(entry: AssetActivityEntry): ActivityView {
  const metadata = entry.metadata;
  return {
    entry,
    description: describeActivity(entry),
    linkedVariantId:
      typeof metadata?.["variantId"] === "string"
        ? (metadata["variantId"] as string)
        : null,
    linkedJobId:
      typeof metadata?.["jobId"] === "string"
        ? (metadata["jobId"] as string)
        : null,
  };
}

/**
 * `AssetActivityRepository.listByAsset` already orders newest-first (`ORDER BY created_at DESC`),
 * so this maps in place rather than re-sorting — re-reversing here would silently invert it the
 * moment the repository's order was ever double-checked against this file instead of the other
 * way around.
 */
export function toActivityTimeline(
  entries: readonly AssetActivityEntry[],
): ActivityView[] {
  return entries.map(toActivityView);
}
