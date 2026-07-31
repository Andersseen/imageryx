import type { AssetActivityEntry } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import {
  describeActivity,
  toActivityTimeline,
  toActivityView,
} from "./activity-view";

function entry(
  event: string,
  metadata: Record<string, unknown> | null = null,
): AssetActivityEntry {
  return {
    id: `entry-${event}`,
    assetId: "asset-1",
    projectId: "project-1",
    event,
    metadata,
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("describeActivity", () => {
  it("describes every real event the backend ever records", () => {
    const events: [string, Record<string, unknown> | null][] = [
      ["asset.uploaded", { originalFilename: "hero.png" }],
      ["asset.metadata_inspected", { width: 1920, height: 1080, warnings: [] }],
      ["asset.ready", null],
      ["asset.updated", { fields: ["name", "visibility"] }],
      ["asset.moved", { fromFolderId: null, toFolderId: "folder-1" }],
      ["asset.tags_changed", { tags: ["hero", "marketing"] }],
      ["asset.deleted", null],
      ["asset.restored", null],
      ["variant.requested", { variantId: "v1", presetId: "p1" }],
      ["variant.processing", { variantId: "v1", presetId: "p1" }],
      ["variant.ready", { variantId: "v1", simulated: true }],
      [
        "processing.failed",
        { jobId: "j1", jobType: "generate-variant", code: "x" },
      ],
      ["processing.retried", { jobId: "j1" }],
      ["download.url_created", { variant: "original" }],
    ];
    for (const [event, metadata] of events) {
      const description = describeActivity(entry(event, metadata));
      expect(description, `event ${event}`).not.toBe(event);
      expect(description.length, `event ${event}`).toBeGreaterThan(0);
    }
  });

  it("includes the uploaded filename when present", () => {
    expect(
      describeActivity(
        entry("asset.uploaded", { originalFilename: "hero.png" }),
      ),
    ).toContain("hero.png");
  });

  it("includes real dimensions from metadata inspection", () => {
    expect(
      describeActivity(
        entry("asset.metadata_inspected", { width: 1920, height: 1080 }),
      ),
    ).toContain("1920 × 1080");
  });

  it("labels a simulated variant-ready event as simulated", () => {
    expect(
      describeActivity(entry("variant.ready", { simulated: true })),
    ).toContain("simulated");
  });

  it("does not claim a variant is simulated when it is not", () => {
    expect(
      describeActivity(entry("variant.ready", { simulated: false })),
    ).not.toContain("simulated");
  });

  it("falls back to the raw event name for an event this file has not been taught, rather than throwing", () => {
    expect(describeActivity(entry("future.event"))).toBe("future.event");
  });

  it("handles missing metadata gracefully for every mapped event", () => {
    for (const event of [
      "asset.uploaded",
      "asset.metadata_inspected",
      "asset.updated",
      "asset.tags_changed",
      "variant.ready",
      "download.url_created",
    ]) {
      expect(() => describeActivity(entry(event, null))).not.toThrow();
    }
  });
});

describe("toActivityView", () => {
  it("extracts a linked variant id from metadata when present", () => {
    const view = toActivityView(
      entry("variant.ready", { variantId: "v1", simulated: true }),
    );
    expect(view.linkedVariantId).toBe("v1");
    expect(view.linkedJobId).toBeNull();
  });

  it("extracts a linked job id from metadata when present", () => {
    const view = toActivityView(entry("processing.failed", { jobId: "j1" }));
    expect(view.linkedJobId).toBe("j1");
  });

  it("links neither when metadata has neither", () => {
    const view = toActivityView(entry("asset.ready", null));
    expect(view.linkedVariantId).toBeNull();
    expect(view.linkedJobId).toBeNull();
  });
});

describe("toActivityTimeline", () => {
  it("preserves the repository's newest-first order rather than re-sorting", () => {
    const entries = [
      entry("asset.restored"),
      entry("asset.deleted"),
      entry("asset.uploaded"),
    ];
    const timeline = toActivityTimeline(entries);
    expect(timeline.map((v) => v.entry.event)).toEqual([
      "asset.restored",
      "asset.deleted",
      "asset.uploaded",
    ]);
  });
});
