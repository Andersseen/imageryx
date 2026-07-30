import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestAsset, insertTestProject } from "../testing/fixtures";
import { ProcessingJobRepository } from "./processing-job.repository";

describe("ProcessingJobRepository", () => {
  let testDb: TestDatabase;
  let repository: ProcessingJobRepository;
  let projectId: string;
  let assetId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = new ProcessingJobRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
    assetId = (await insertTestAsset(testDb.db, projectId)).id;
  });

  afterEach(() => testDb.teardown());

  it("creates a job with a validated, typed input payload round-tripped through JSON", async () => {
    const created = await repository.create({
      projectId,
      assetId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId },
    });
    expect(created.status).toBe("queued");
    expect(created.attempts).toBe(0);

    const found = await repository.findById(created.id);
    expect(found?.input).toEqual({ type: "inspect-metadata", assetId });
  });

  it("persists a typed result payload on completion", async () => {
    const created = await repository.create({
      projectId,
      assetId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId },
    });
    const updated = await repository.update(created.id, {
      status: "completed",
      result: {
        type: "inspect-metadata",
        width: 800,
        height: 600,
        hasAlpha: false,
        dominantColor: "#ffffff",
      },
      completedAt: new Date().toISOString(),
    });

    expect(updated?.status).toBe("completed");
    expect(updated?.result).toEqual({
      type: "inspect-metadata",
      width: 800,
      height: 600,
      hasAlpha: false,
      dominantColor: "#ffffff",
    });
  });

  it("records a failure with error code and message", async () => {
    const created = await repository.create({
      projectId,
      assetId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId },
    });
    const updated = await repository.update(created.id, {
      status: "failed",
      errorCode: "provider_unavailable",
      errorMessage: "mock provider simulated failure",
      failedAt: new Date().toISOString(),
      attempts: 1,
    });

    expect(updated?.status).toBe("failed");
    expect(updated?.errorCode).toBe("provider_unavailable");
    expect(updated?.attempts).toBe(1);
  });

  it("filters jobs by project, type, and status", async () => {
    await repository.create({
      projectId,
      assetId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId },
    });
    await repository.create({
      projectId,
      assetId,
      type: "extract-placeholder",
      input: { type: "extract-placeholder", assetId },
    });

    const results = await repository.list({
      projectId,
      type: "extract-placeholder",
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.type).toBe("extract-placeholder");
  });

  it("rejects malformed JSON in the input column when reading (JSON validation)", async () => {
    const created = await repository.create({
      projectId,
      assetId,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId },
    });
    await testDb.db
      .prepare("UPDATE processing_jobs SET input = ? WHERE id = ?")
      .bind(JSON.stringify({ type: "inspect-metadata" }), created.id)
      .run();

    await expect(repository.findById(created.id)).rejects.toThrow();
  });
});
