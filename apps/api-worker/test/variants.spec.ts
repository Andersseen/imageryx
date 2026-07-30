import { AssetRepository, PresetRepository, ProjectRepository } from "@imageryx/database";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("POST /v1/assets/:assetId/variants", () => {
  let projectId: string;
  let assetId: string;
  let presetId: string;

  beforeEach(async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({
      name: "Variants Test",
      slug: `variants-test-${crypto.randomUUID()}`,
    });
    projectId = project.id;

    const assets = new AssetRepository(env.DB);
    const asset = await assets.create({
      projectId,
      name: "Ready Asset",
      slug: "ready-asset",
      path: "ready-asset",
      storageKey: `originals/${projectId}/x/original.png`,
      originalFilename: "asset.png",
      mimeType: "image/png",
      extension: "png",
      width: 100,
      height: 100,
      sizeBytes: 10,
      checksum: "c".repeat(64),
      visibility: "public",
      processingStatus: "ready",
    });
    assetId = asset.id;

    const presets = new PresetRepository(env.DB);
    const preset = await presets.create({
      projectId,
      name: "Thumb",
      slug: "thumb",
      operations: [{ type: "resize", width: 50, height: 50, fit: "cover" }],
      outputFormat: "auto",
    });
    presetId = preset.id;
  });

  it("creates a pending variant and a generate-variant job, returning 202", async () => {
    const response = await SELF.fetch(`https://example.com/v1/assets/${assetId}/variants`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ presetId }),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { variant: { status: string }; status: string };
    expect(body.variant.status).toBe("pending");
    expect(body.status).toBe("created");
  });

  it("is idempotent: a duplicate request returns the same variant instead of creating a second one", async () => {
    const first = await SELF.fetch(`https://example.com/v1/assets/${assetId}/variants`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ presetId }),
    });
    const firstBody = (await first.json()) as { variant: { id: string } };

    const second = await SELF.fetch(`https://example.com/v1/assets/${assetId}/variants`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ presetId }),
    });
    expect(second.status).toBe(202);
    const secondBody = (await second.json()) as { variant: { id: string }; status: string };
    expect(secondBody.variant.id).toBe(firstBody.variant.id);
    expect(secondBody.status).toBe("pending");
  });

  it("rejects a variant request for an asset that is not ready", async () => {
    const assets = new AssetRepository(env.DB);
    const pendingAsset = await assets.create({
      projectId,
      name: "Pending Asset",
      slug: "pending-asset",
      path: "pending-asset",
      storageKey: `originals/${projectId}/y/original.png`,
      originalFilename: "pending.png",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: 10,
      checksum: "d".repeat(64),
      visibility: "public",
      processingStatus: "pending",
    });

    const response = await SELF.fetch(
      `https://example.com/v1/assets/${pendingAsset.id}/variants`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      },
    );
    expect(response.status).toBe(409);
  });
});
