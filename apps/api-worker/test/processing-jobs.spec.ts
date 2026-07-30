import { ProcessingJobRepository, ProjectRepository } from "@imageryx/database";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeaders } from "./helpers";

describe("processing jobs", () => {
  let projectId: string;

  beforeEach(async () => {
    const projects = new ProjectRepository(env.DB);
    const project = await projects.create({
      name: "Jobs Test",
      slug: `jobs-test-${crypto.randomUUID()}`,
    });
    projectId = project.id;
  });

  it("lists jobs scoped to a project", async () => {
    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: crypto.randomUUID() },
    });

    const response = await SELF.fetch(
      `https://example.com/v1/processing-jobs?projectId=${projectId}`,
      { headers: authHeaders() },
    );
    const body = (await response.json()) as { items: { id: string }[] };
    expect(body.items.some((j) => j.id === job.id)).toBe(true);
  });

  it("retries a failed job", async () => {
    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: crypto.randomUUID() },
    });
    await jobs.update(job.id, { status: "failed", errorCode: "test_failure" });

    const response = await SELF.fetch(
      `https://example.com/v1/processing-jobs/${job.id}/retry`,
      { method: "POST", headers: authHeaders() },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; errorCode: string | null };
    expect(body.status).toBe("queued");
    expect(body.errorCode).toBeNull();
  });

  it("refuses to retry a job that is not failed", async () => {
    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: crypto.randomUUID() },
    });

    const response = await SELF.fetch(
      `https://example.com/v1/processing-jobs/${job.id}/retry`,
      { method: "POST", headers: authHeaders() },
    );
    expect(response.status).toBe(409);
  });

  it("cancels a queued job", async () => {
    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: crypto.randomUUID() },
    });

    const response = await SELF.fetch(
      `https://example.com/v1/processing-jobs/${job.id}/cancel`,
      { method: "POST", headers: authHeaders() },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("cancelled");
  });

  it("refuses to cancel a job that is already processing", async () => {
    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: crypto.randomUUID() },
    });
    await jobs.update(job.id, { status: "processing" });

    const response = await SELF.fetch(
      `https://example.com/v1/processing-jobs/${job.id}/cancel`,
      { method: "POST", headers: authHeaders() },
    );
    expect(response.status).toBe(409);
  });
});
