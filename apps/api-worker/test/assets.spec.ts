import { AssetRepository, FolderRepository, ProjectRepository } from "@imageryx/database";
import { createDecodableImageFixture } from "@imageryx/test-utils";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

function fileFromFixture(mimeType: Parameters<typeof createDecodableImageFixture>[0]): {
  file: File;
  fixture: ReturnType<typeof createDecodableImageFixture>;
} {
  const fixture = createDecodableImageFixture(mimeType);
  const bytes = new Uint8Array(fixture.bytes);
  return { file: new File([bytes], fixture.filename, { type: mimeType }), fixture };
}

describe("POST /v1/assets/upload", () => {
  let projectId: string;

  beforeEach(async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({
      name: "Upload Test",
      slug: `upload-test-${crypto.randomUUID()}`,
    });
    projectId = project.id;
  });

  it("uploads a valid PNG and returns a pending asset with a processing job", async () => {
    const { file } = fileFromFixture("image/png");
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);

    const response = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      asset: { processingStatus: string; mimeType: string };
      processingJobId: string;
    };
    expect(body.asset.processingStatus).toBe("pending");
    expect(body.asset.mimeType).toBe("image/png");
    expect(body.processingJobId).toBeTruthy();
  });

  it("uploads a valid JPEG", async () => {
    const { file } = fileFromFixture("image/jpeg");
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);

    const response = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(response.status).toBe(201);
  });

  it("flags an SVG upload as untrusted content without rejecting it", async () => {
    const { file } = fileFromFixture("image/svg+xml");
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);

    const response = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { securityWarnings: string[] };
    expect(body.securityWarnings).toContain("svg-detected-untrusted-content");
  });

  it("rejects a file whose claimed MIME type does not match its signature", async () => {
    const pngBytes = new Uint8Array(createDecodableImageFixture("image/png").bytes);
    const mislabeledFile = new File([pngBytes], "fake.jpg", { type: "image/jpeg" });
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", mislabeledFile);

    const response = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(response.status).toBe(415);
  });

  it("rejects an oversized file", async () => {
    // MAX_UPLOAD_SIZE_MB=25 in wrangler.jsonc's test vars — build a body larger than that.
    const oversized = new Uint8Array(26 * 1024 * 1024);
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", new File([oversized], "big.png", { type: "image/png" }));

    const response = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect([400, 413]).toContain(response.status);
  });

  it("normalizes a path-traversal filename into a safe slug", async () => {
    const fixture = createDecodableImageFixture("image/png");
    const file = new File([new Uint8Array(fixture.bytes)], "../../etc/passwd.png", {
      type: "image/png",
    });
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);

    const response = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { asset: { path: string; slug: string } };
    expect(body.asset.path).not.toContain("..");
    expect(body.asset.path).not.toContain("/etc/");
  });

  it("rejects an upload for an unknown project", async () => {
    const { file } = fileFromFixture("image/png");
    const form = new FormData();
    form.set("projectId", "00000000-0000-0000-0000-000000000000");
    form.set("file", file);

    const response = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(response.status).toBe(404);
  });

  it("surfaces a duplicate checksum as a non-blocking candidate", async () => {
    const { file: first } = fileFromFixture("image/png");
    const form1 = new FormData();
    form1.set("projectId", projectId);
    form1.set("file", first);
    const firstResponse = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form1,
    });
    const firstBody = (await firstResponse.json()) as { asset: { id: string; path: string } };

    const { file: second } = fileFromFixture("image/png");
    const form2 = new FormData();
    form2.set("projectId", projectId);
    form2.set("name", "Second Copy");
    form2.set("file", second);
    const secondResponse = await SELF.fetch("https://example.com/v1/assets/upload", {
      method: "POST",
      headers: authHeaders(),
      body: form2,
    });
    expect(secondResponse.status).toBe(201);
    const secondBody = (await secondResponse.json()) as {
      duplicateCandidates: { assetId: string; path: string }[];
    };
    expect(secondBody.duplicateCandidates.some((d) => d.assetId === firstBody.asset.id)).toBe(
      true,
    );
  });
});

describe("asset lifecycle", () => {
  let projectId: string;
  let assetId: string;

  beforeEach(async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({
      name: "Lifecycle",
      slug: `lifecycle-${crypto.randomUUID()}`,
    });
    projectId = project.id;
    const assets = new AssetRepository(env.DB);
    const asset = await assets.create({
      projectId,
      name: "Lifecycle Asset",
      slug: "lifecycle-asset",
      path: "lifecycle-asset",
      storageKey: `originals/${projectId}/x/original.png`,
      originalFilename: "asset.png",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: 10,
      checksum: "b".repeat(64),
      visibility: "private",
      processingStatus: "ready",
    });
    assetId = asset.id;
  });

  it("lists assets scoped to a project", async () => {
    const response = await SELF.fetch(`https://example.com/v1/assets?projectId=${projectId}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { id: string }[] };
    expect(body.items.some((a) => a.id === assetId)).toBe(true);
  });

  it("filters assets by processingStatus", async () => {
    const response = await SELF.fetch(
      `https://example.com/v1/assets?projectId=${projectId}&processingStatus=pending`,
      { headers: authHeaders() },
    );
    const body = (await response.json()) as { items: { id: string }[] };
    expect(body.items.some((a) => a.id === assetId)).toBe(false);
  });

  it("returns full asset details", async () => {
    const response = await SELF.fetch(`https://example.com/v1/assets/${assetId}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; project: { slug: string } | null };
    expect(body.id).toBe(assetId);
    expect(body.project).toBeTruthy();
  });

  it("updates the asset name", async () => {
    const response = await SELF.fetch(`https://example.com/v1/assets/${assetId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { name: string };
    expect(body.name).toBe("Renamed");
  });

  it("moves the asset into a folder within the same project", async () => {
    const folder = await new FolderRepository(env.DB).create({
      projectId,
      parentId: null,
      name: "Target",
      slug: "target",
      path: "target",
    });

    const response = await SELF.fetch(`https://example.com/v1/assets/${assetId}/move`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folder.id }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { folderId: string; path: string };
    expect(body.folderId).toBe(folder.id);
    expect(body.path).toBe("target/lifecycle-asset");
  });

  it("replaces asset tags", async () => {
    const response = await SELF.fetch(`https://example.com/v1/assets/${assetId}/tags`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["portfolio", "hero"] }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tags: string[] };
    expect(body.tags.sort()).toEqual(["hero", "portfolio"]);
  });

  it("soft-deletes then restores an asset", async () => {
    const deleteResponse = await SELF.fetch(`https://example.com/v1/assets/${assetId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(deleteResponse.status).toBe(204);

    const assets = new AssetRepository(env.DB);
    expect((await assets.findById(assetId))?.deletedAt).not.toBeNull();

    const restoreResponse = await SELF.fetch(
      `https://example.com/v1/assets/${assetId}/restore`,
      { method: "POST", headers: authHeaders() },
    );
    expect(restoreResponse.status).toBe(200);
    expect((await assets.findById(assetId))?.deletedAt).toBeNull();
  });
});
