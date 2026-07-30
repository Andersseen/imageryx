import { AssetRepository, ProjectRepository } from "@imageryx/database";
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("POST /v1/projects", () => {
  it("creates a project and returns 201", async () => {
    const response = await SELF.fetch("https://example.com/v1/projects", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project", withSystemPresets: false }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; slug: string };
    expect(body.slug).toBe("test-project");
  });

  it("creates system presets by default", async () => {
    const response = await SELF.fetch("https://example.com/v1/projects", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "With Presets" }),
    });
    const body = (await response.json()) as { id: string };
    const presetsResponse = await SELF.fetch(
      `https://example.com/v1/presets?projectId=${body.id}`,
      { headers: authHeaders() },
    );
    const presets = (await presetsResponse.json()) as { items: unknown[] };
    expect(presets.items.length).toBeGreaterThan(0);
  });

  it("rejects a duplicate slug with 409", async () => {
    await SELF.fetch("https://example.com/v1/projects", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dup", slug: "dup-project", withSystemPresets: false }),
    });
    const response = await SELF.fetch("https://example.com/v1/projects", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dup Again", slug: "dup-project", withSystemPresets: false }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("duplicate_project_slug");
  });
});

describe("GET /v1/projects", () => {
  it("lists projects with summary counts", async () => {
    const projects = new ProjectRepository(env.DB);
    await projects.create({ name: "List Test", slug: "list-test" });

    const response = await SELF.fetch("https://example.com/v1/projects?pageSize=100", {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: { slug: string; assetCount: number }[];
      total: number;
    };
    const found = body.items.find((p) => p.slug === "list-test");
    expect(found).toBeTruthy();
    expect(found?.assetCount).toBe(0);
  });

  it("supports search by name", async () => {
    const projects = new ProjectRepository(env.DB);
    await projects.create({ name: "Findable Unique Name", slug: "findable-unique" });

    const response = await SELF.fetch(
      "https://example.com/v1/projects?search=Findable%20Unique",
      { headers: authHeaders() },
    );
    const body = (await response.json()) as { items: { slug: string }[] };
    expect(body.items.some((p) => p.slug === "findable-unique")).toBe(true);
  });
});

describe("GET /v1/projects/:projectId", () => {
  it("returns 404 for an unknown project", async () => {
    const response = await SELF.fetch(
      "https://example.com/v1/projects/00000000-0000-0000-0000-000000000000",
      { headers: authHeaders() },
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /v1/projects/:projectId", () => {
  it("updates the project name", async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({ name: "Before", slug: "before-slug" });

    const response = await SELF.fetch(`https://example.com/v1/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "After" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { name: string };
    expect(body.name).toBe("After");
  });
});

describe("DELETE /v1/projects/:projectId", () => {
  it("rejects deletion when active assets exist", async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({ name: "Has Assets", slug: "has-assets" });
    const assets = new AssetRepository(env.DB);
    await assets.create({
      projectId: project.id,
      name: "Asset",
      slug: "asset",
      path: "asset",
      storageKey: `originals/${project.id}/x/original.png`,
      originalFilename: "asset.png",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: 10,
      checksum: "a".repeat(64),
      visibility: "private",
      processingStatus: "ready",
    });

    const response = await SELF.fetch(`https://example.com/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(response.status).toBe(409);
  });

  it("deletes a project with no assets", async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({ name: "Empty", slug: "empty-project" });

    const response = await SELF.fetch(`https://example.com/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(response.status).toBe(204);
    expect(await projects.findById(project.id)).toBeNull();
  });
});
