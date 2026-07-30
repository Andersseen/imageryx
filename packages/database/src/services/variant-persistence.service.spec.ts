import { DuplicateVariantError } from "@imageryx/image-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PresetRepository } from "../repositories/preset.repository";
import { ProcessingJobRepository } from "../repositories/processing-job.repository";
import { VariantRepository } from "../repositories/variant.repository";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/create-test-database";
import { insertTestAsset, insertTestProject } from "../testing/fixtures";
import { VariantPersistenceService } from "./variant-persistence.service";

describe("VariantPersistenceService", () => {
  let testDb: TestDatabase;
  let service: VariantPersistenceService;
  let variants: VariantRepository;
  let jobs: ProcessingJobRepository;
  let projectId: string;
  let assetId: string;
  let presetId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    service = new VariantPersistenceService(testDb.db);
    variants = new VariantRepository(testDb.db);
    jobs = new ProcessingJobRepository(testDb.db);
    projectId = (await insertTestProject(testDb.db)).id;
    assetId = (await insertTestAsset(testDb.db, projectId)).id;
    presetId = (
      await new PresetRepository(testDb.db).create({
        projectId,
        name: "Thumbnail",
        slug: "thumbnail",
        operations: [],
        outputFormat: "auto",
      })
    ).id;
  });

  afterEach(() => testDb.teardown());

  it("creates a variant and its generate-variant processing job together", async () => {
    const { variantId, processingJobId } = await service.createVariantWithJob(
      {
        assetId,
        presetId,
        presetHash: "hash-1",
        provider: "mock",
        status: "pending",
      },
      {
        projectId,
        type: "generate-variant",
        input: {
          type: "generate-variant",
          assetId,
          presetId,
          presetHash: "hash-1",
          persist: true,
        },
      },
    );

    expect(await variants.findById(variantId)).not.toBeNull();
    const job = await jobs.findById(processingJobId);
    expect(job?.type).toBe("generate-variant");
    expect(job?.assetId).toBe(assetId);
  });

  it("rolls back the processing job when the variant already exists (batch atomicity)", async () => {
    await service.createVariantWithJob(
      {
        assetId,
        presetId,
        presetHash: "hash-1",
        provider: "mock",
        status: "pending",
      },
      {
        projectId,
        type: "generate-variant",
        input: {
          type: "generate-variant",
          assetId,
          presetId,
          presetHash: "hash-1",
          persist: true,
        },
      },
    );

    const jobsBefore = await jobs.list({ projectId });

    await expect(
      service.createVariantWithJob(
        {
          assetId,
          presetId,
          presetHash: "hash-1",
          provider: "mock",
          status: "pending",
        },
        {
          projectId,
          type: "generate-variant",
          input: {
            type: "generate-variant",
            assetId,
            presetId,
            presetHash: "hash-1",
            persist: true,
          },
        },
      ),
    ).rejects.toThrow(DuplicateVariantError);

    const jobsAfter = await jobs.list({ projectId });
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });
});
