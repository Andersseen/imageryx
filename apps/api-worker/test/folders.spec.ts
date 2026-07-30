import { AssetRepository, FolderRepository, ProjectRepository } from "@imageryx/database";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("folders", () => {
  let projectId: string;

  beforeEach(async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({
      name: "Folder Test",
      slug: `folder-test-${crypto.randomUUID()}`,
    });
    projectId = project.id;
  });

  it("creates a root folder", async () => {
    const response = await SELF.fetch(
      `https://example.com/v1/projects/${projectId}/folders`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Photos" }),
      },
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { path: string; slug: string };
    expect(body.path).toBe("photos");
  });

  it("creates a nested folder under a parent", async () => {
    const parentResponse = await SELF.fetch(
      `https://example.com/v1/projects/${projectId}/folders`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Courses" }),
      },
    );
    const parent = (await parentResponse.json()) as { id: string };

    const childResponse = await SELF.fetch(
      `https://example.com/v1/projects/${projectId}/folders`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Signals", parentId: parent.id }),
      },
    );
    expect(childResponse.status).toBe(201);
    const child = (await childResponse.json()) as { path: string };
    expect(child.path).toBe("courses/signals");
  });

  it("rejects a duplicate sibling slug with 409", async () => {
    await SELF.fetch(`https://example.com/v1/projects/${projectId}/folders`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dup" }),
    });
    const response = await SELF.fetch(
      `https://example.com/v1/projects/${projectId}/folders`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Dup" }),
      },
    );
    expect(response.status).toBe(409);
  });

  it("rejects moving a folder into its own descendant", async () => {
    const folders = new FolderRepository(env.DB);
    const parent = await folders.create({
      projectId,
      parentId: null,
      name: "Parent",
      slug: "parent",
      path: "parent",
    });
    const child = await folders.create({
      projectId,
      parentId: parent.id,
      name: "Child",
      slug: "child",
      path: "parent/child",
    });

    const response = await SELF.fetch(`https://example.com/v1/folders/${parent.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: child.id }),
    });
    expect(response.status).toBe(400);
  });

  it("returns a flat list and, on request, a tree", async () => {
    const folders = new FolderRepository(env.DB);
    const parent = await folders.create({
      projectId,
      parentId: null,
      name: "Parent",
      slug: "parent",
      path: "parent",
    });
    await folders.create({
      projectId,
      parentId: parent.id,
      name: "Child",
      slug: "child",
      path: "parent/child",
    });

    const response = await SELF.fetch(
      `https://example.com/v1/projects/${projectId}/folders?tree=true`,
      { headers: authHeaders() },
    );
    const body = (await response.json()) as { items: unknown[]; tree: { children: unknown[] }[] };
    expect(body.items).toHaveLength(2);
    expect(body.tree).toHaveLength(1);
    expect(body.tree[0]?.children).toHaveLength(1);
  });

  it("rejects deleting a folder with active children or assets", async () => {
    const folders = new FolderRepository(env.DB);
    const folder = await folders.create({
      projectId,
      parentId: null,
      name: "NotEmpty",
      slug: "not-empty",
      path: "not-empty",
    });
    const assets = new AssetRepository(env.DB);
    await assets.create({
      projectId,
      folderId: folder.id,
      name: "Asset",
      slug: "asset",
      path: "not-empty/asset",
      storageKey: `originals/${projectId}/x/original.png`,
      originalFilename: "asset.png",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: 10,
      checksum: "a".repeat(64),
      visibility: "private",
      processingStatus: "ready",
    });

    const response = await SELF.fetch(`https://example.com/v1/folders/${folder.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(response.status).toBe(409);
  });
});
