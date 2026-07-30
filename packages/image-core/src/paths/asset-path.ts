import { joinLogicalPath } from "./logical-path";

/**
 * A stable, human-readable *public* path ("profile/andrii"), independent
 * of the opaque physical storage key. Pure function only — conflict
 * detection (does this path already exist?) requires a database lookup,
 * which does not belong in a path utility; the caller resolves a conflict
 * by re-invoking this with a `suffix`.
 */
export function generateAssetPath(
  folderPath: string,
  assetSlug: string,
  suffix?: number,
): string {
  const slugWithSuffix =
    suffix !== undefined && suffix > 0 ? `${assetSlug}-${suffix}` : assetSlug;
  return joinLogicalPath(folderPath, slugWithSuffix);
}
