import { PresetRepository, ProjectRepository } from "@imageryx/database";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("presets", () => {
  let projectId: string;

  beforeEach(async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({
      name: "Presets Test",
      slug: `presets-test-${crypto.randomUUID()}`,
    });
    projectId = project.id;
  });

  it("creates a preset", async () => {
    const response = await SELF.fetch("https://example.com/v1/presets", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: "Square",
        operations: [{ type: "resize", width: 200, height: 200, fit: "cover" }],
        outputFormat: "auto",
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { slug: string; isSystem: boolean };
    expect(body.slug).toBe("square");
    expect(body.isSystem).toBe(false);
  });

  it("lists presets for a project", async () => {
    const presets = new PresetRepository(env.DB);
    await presets.create({
      projectId,
      name: "Listed",
      slug: "listed",
      operations: [],
      outputFormat: "auto",
    });

    const response = await SELF.fetch(`https://example.com/v1/presets?projectId=${projectId}`, {
      headers: authHeaders(),
    });
    const body = (await response.json()) as { items: { slug: string }[] };
    expect(body.items.some((p) => p.slug === "listed")).toBe(true);
  });

  it("detects an equivalent existing preset and rejects creation with 409", async () => {
    await SELF.fetch("https://example.com/v1/presets", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: "Original",
        operations: [{ type: "resize", width: 100, height: 100, fit: "cover" }],
        outputFormat: "auto",
        quality: 80,
      }),
    });

    const response = await SELF.fetch("https://example.com/v1/presets", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: "Equivalent",
        operations: [{ type: "resize", width: 100, height: 100, fit: "cover" }],
        outputFormat: "auto",
        quality: 80,
      }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("equivalent_preset_exists");
  });

  it("rejects deleting a system preset", async () => {
    const presets = new PresetRepository(env.DB);
    const systemPreset = await presets.create({
      projectId,
      name: "System",
      slug: "system-one",
      operations: [],
      outputFormat: "auto",
      isSystem: true,
    });

    const response = await SELF.fetch(`https://example.com/v1/presets/${systemPreset.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(response.status).toBe(409);
  });

  it("previews a preset with a clearly simulated result", async () => {
    const presets = new PresetRepository(env.DB);
    const preset = await presets.create({
      projectId,
      name: "Preview Me",
      slug: "preview-me",
      operations: [{ type: "resize", width: 150, height: 150, fit: "cover" }],
      outputFormat: "auto",
    });

    const response = await SELF.fetch(`https://example.com/v1/presets/${preset.id}/preview`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { simulated: boolean; previewUrl: string };
    expect(body.simulated).toBe(true);
    expect(body.previewUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });
});
