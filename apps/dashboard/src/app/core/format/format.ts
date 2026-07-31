const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Binary units (1 KB = 1024 B), matching how storage sizes are reported everywhere else in this
 * repo. One decimal place above KB, none for raw bytes — enough precision to compare two
 * variants without implying more accuracy than an integer byte count carries.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes))
    return "—";
  if (bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * `null` dimensions are a real, expected state, not an error: AVIF headers are not parsed at all
 * and a truncated header of any format reports `null` rather than a fabricated number (see
 * context.md, "Metadata inspection"). Rendering "—" is how the UI stays honest about that.
 */
export function formatDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  if (!width || !height) return "—";
  return `${width} × ${height}`;
}

export function formatAspectRatio(ratio: number | null | undefined): string {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return "—";
  return `${ratio.toFixed(2)}:1`;
}

/** Absolute, locale-formatted timestamp — the tooltip/detail counterpart to `formatRelativeTime`. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RELATIVE_THRESHOLDS: readonly {
  limitSeconds: number;
  unit: Intl.RelativeTimeFormatUnit;
  perUnit: number;
}[] = [
  { limitSeconds: 60, unit: "second", perUnit: 1 },
  { limitSeconds: 3600, unit: "minute", perUnit: 60 },
  { limitSeconds: 86_400, unit: "hour", perUnit: 3600 },
  { limitSeconds: 2_592_000, unit: "day", perUnit: 86_400 },
  { limitSeconds: 31_536_000, unit: "month", perUnit: 2_592_000 },
];

/**
 * `now` is an explicit parameter rather than an internal `Date.now()` call so this stays a pure
 * function of its inputs and can be tested without freezing the clock.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const deltaSeconds = (date.getTime() - now.getTime()) / 1000;
  const absolute = Math.abs(deltaSeconds);
  if (absolute < 5) return "just now";

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const threshold of RELATIVE_THRESHOLDS) {
    if (absolute < threshold.limitSeconds) {
      return formatter.format(
        Math.round(deltaSeconds / threshold.perUnit),
        threshold.unit,
      );
    }
  }
  return formatter.format(Math.round(deltaSeconds / 31_536_000), "year");
}

/** The visible part of a UUID — long enough to be unambiguous in practice, short enough to fit a column. */
export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return "—";
  return id.length <= length ? id : id.slice(0, length);
}

/**
 * Collapses the middle of an over-long logical path, keeping the folder head and the filename
 * tail — the two parts that identify it. Truncating only the end hides exactly the part a user
 * scans for.
 */
export function truncateMiddle(value: string, maxLength = 42): string {
  if (value.length <= maxLength) return value;
  const keep = Math.max(1, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(value.length - keep)}`;
}

export function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
