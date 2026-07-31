import { describe, expect, it } from "vitest";
import {
  formatAspectRatio,
  formatBytes,
  formatCount,
  formatDateTime,
  formatDimensions,
  formatRelativeTime,
  shortId,
  truncateMiddle,
} from "./format";

describe("formatBytes", () => {
  it("renders raw bytes without a decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("uses binary units above a kilobyte", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("drops the decimal once the value reaches three digits", () => {
    expect(formatBytes(1024 * 150)).toBe("150 KB");
  });

  it("renders an em dash rather than a wrong number for missing or invalid sizes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatDimensions", () => {
  it("renders both dimensions when known", () => {
    expect(formatDimensions(1920, 1080)).toBe("1920 × 1080");
  });

  it("renders an em dash when either dimension is unknown", () => {
    // A real state: AVIF headers are never parsed, so width/height come back null.
    expect(formatDimensions(null, null)).toBe("—");
    expect(formatDimensions(1920, null)).toBe("—");
    expect(formatDimensions(null, 1080)).toBe("—");
  });
});

describe("formatAspectRatio", () => {
  it("renders a two-decimal ratio", () => {
    expect(formatAspectRatio(1.7777)).toBe("1.78:1");
    expect(formatAspectRatio(1)).toBe("1.00:1");
  });

  it("rejects missing or nonsensical ratios", () => {
    expect(formatAspectRatio(null)).toBe("—");
    expect(formatAspectRatio(0)).toBe("—");
    expect(formatAspectRatio(-2)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("formats a valid ISO timestamp", () => {
    expect(formatDateTime("2026-07-31T10:30:00.000Z")).not.toBe("—");
  });

  it("rejects missing or unparseable input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("collapses the last few seconds to 'just now'", () => {
    expect(formatRelativeTime("2026-07-31T11:59:58.000Z", now)).toBe(
      "just now",
    );
  });

  it("scales through minutes, hours, days, months and years", () => {
    expect(formatRelativeTime("2026-07-31T11:30:00.000Z", now)).toContain("30");
    expect(formatRelativeTime("2026-07-31T09:00:00.000Z", now)).toContain("3");
    expect(formatRelativeTime("2026-07-28T12:00:00.000Z", now)).toContain("3");
    expect(formatRelativeTime("2026-05-31T12:00:00.000Z", now)).toContain("2");
    expect(formatRelativeTime("2024-07-31T12:00:00.000Z", now)).toContain("2");
  });

  it("handles future timestamps without producing a negative-looking string", () => {
    expect(formatRelativeTime("2026-07-31T13:00:00.000Z", now)).not.toContain(
      "-",
    );
  });

  it("rejects missing or unparseable input", () => {
    expect(formatRelativeTime(null, now)).toBe("—");
    expect(formatRelativeTime("nope", now)).toBe("—");
  });
});

describe("shortId", () => {
  it("truncates a uuid to a scannable prefix", () => {
    expect(shortId("e7249717-bce1-4fe2-b7d4-f60c201852be")).toBe("e7249717");
  });

  it("leaves an already-short id alone", () => {
    expect(shortId("abc")).toBe("abc");
  });

  it("renders an em dash for a missing id", () => {
    expect(shortId(null)).toBe("—");
  });
});

describe("truncateMiddle", () => {
  it("leaves a short path untouched", () => {
    expect(truncateMiddle("profile/andrii")).toBe("profile/andrii");
  });

  it("keeps both the head and the tail of a long path", () => {
    const result = truncateMiddle(
      "courses/signals/deep/nested/folder/hero-image-name",
      20,
    );
    expect(result).toContain("…");
    expect(result.startsWith("courses")).toBe(true);
    expect(result.endsWith("name")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
  });
});

describe("formatCount", () => {
  it("pluralizes based on the count", () => {
    expect(formatCount(0, "asset")).toBe("0 assets");
    expect(formatCount(1, "asset")).toBe("1 asset");
    expect(formatCount(5, "asset")).toBe("5 assets");
  });

  it("accepts an irregular plural", () => {
    expect(formatCount(2, "entry", "entries")).toBe("2 entries");
  });
});
