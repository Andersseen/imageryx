import { DuplicateVariantError } from "@imageryx/image-core";
import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";
import {
  ProcessingJobRepository,
  type CreateProcessingJobRow,
} from "../repositories/processing-job.repository";
import {
  VariantRepository,
  type CreateVariantRow,
} from "../repositories/variant.repository";

export interface CreateVariantWithJobResult {
  variantId: string;
  processingJobId: string;
}

const UNIQUE_CONSTRAINT_ERROR_PATTERN = /UNIQUE constraint failed/i;

/**
 * `db.batch()` runs as one implicit transaction, so if the variant insert
 * hits the `idx_variants_unique_asset_preset_hash` constraint, the
 * processing job insert is rolled back too — no orphaned job for a
 * variant that was never created.
 */
export class VariantPersistenceService {
  private readonly variants: VariantRepository;
  private readonly processingJobs: ProcessingJobRepository;

  constructor(private readonly db: D1Client) {
    this.variants = new VariantRepository(db);
    this.processingJobs = new ProcessingJobRepository(db);
  }

  async createVariantWithJob(
    variantInput: CreateVariantRow,
    jobInput: Omit<CreateProcessingJobRow, "assetId" | "projectId"> & {
      projectId: string;
    },
  ): Promise<CreateVariantWithJobResult> {
    const variantId = generateId();
    const processingJobId = generateId();
    const timestamp = nowIso();

    try {
      await this.db.batch([
        this.variants.buildInsertStatement(variantId, variantInput, timestamp),
        this.processingJobs.buildInsertStatement(
          processingJobId,
          { ...jobInput, assetId: variantInput.assetId },
          timestamp,
        ),
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        UNIQUE_CONSTRAINT_ERROR_PATTERN.test(error.message)
      ) {
        throw new DuplicateVariantError(
          `a variant for asset "${variantInput.assetId}" with preset hash "${variantInput.presetHash}" already exists`,
        );
      }
      throw error;
    }

    return { variantId, processingJobId };
  }
}
