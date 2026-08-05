import type {
  ImageVariant,
  PreferredProvider,
  TransformationProviderName,
} from "@imageryx/contracts";
import {
  AssetRepository,
  PresetRepository,
  ProcessingJobRepository,
  VariantPersistenceService,
  VariantRepository,
  type D1Client,
} from "@imageryx/database";
import {
  DuplicateVariantError,
  hashPreset,
  selectTransformationProvider,
  validatePresetSemantics,
} from "@imageryx/image-core";
import {
  CLOUDFLARE_CAPABILITIES,
  CLOUDINARY_CAPABILITIES,
  MOCK_CAPABILITIES,
} from "@imageryx/providers";
import { ConflictError, NotFoundError, ValidationHttpError } from "../lib/errors";

export interface RequestVariantInput {
  assetId: string;
  presetId: string;
  persist: boolean;
  preferredProvider: PreferredProvider;
  /**
   * Provider configured for the deployment. When it is a real external provider
   * (not "mock"), external providers are enabled and this provider is preferred
   * unless the caller explicitly asked for another one.
   */
  configuredProvider?: TransformationProviderName;
}

export type RequestVariantOutcome =
  | { status: "ready"; variant: ImageVariant; processingJobId: null }
  | { status: "pending"; variant: ImageVariant; processingJobId: string | null }
  | { status: "failed"; variant: ImageVariant; processingJobId: string | null }
  | { status: "created"; variant: ImageVariant; processingJobId: string };

const CAPABILITIES = [MOCK_CAPABILITIES, CLOUDFLARE_CAPABILITIES, CLOUDINARY_CAPABILITIES];

/**
 * Idempotent by construction: `variants`'s unique `(asset_id, preset_hash)`
 * index is the final protection (see context.md), this function is just
 * the read-before-write fast path that avoids hitting it in the common
 * case. Shared by the `POST /v1/assets/:assetId/variants` route and the
 * backend integration test.
 */
export async function requestVariant(
  db: D1Client,
  input: RequestVariantInput,
): Promise<RequestVariantOutcome> {
  const assets = new AssetRepository(db);
  const asset = await assets.findById(input.assetId);
  if (!asset) throw new NotFoundError("asset");
  if (asset.deletedAt) {
    throw new ConflictError("asset_deleted", "This asset has been deleted.");
  }
  if (asset.processingStatus !== "ready") {
    throw new ConflictError(
      "asset_not_ready",
      "This asset has not finished metadata inspection yet — try again once it is ready.",
    );
  }

  const presets = new PresetRepository(db);
  const preset = await presets.findById(input.presetId);
  if (!preset) throw new NotFoundError("preset");
  if (preset.projectId !== asset.projectId) {
    throw new ValidationHttpError("This preset does not belong to the asset's project.");
  }

  validatePresetSemantics({
    operations: preset.operations,
    outputFormat: preset.outputFormat,
    quality: preset.quality,
  });
  const presetHash = await hashPreset({
    operations: preset.operations,
    outputFormat: preset.outputFormat,
    quality: preset.quality,
  });

  const configuredProvider = input.configuredProvider ?? "mock";
  const externalProvidersEnabled = configuredProvider !== "mock";
  const explicitPreferred =
    input.preferredProvider === "auto" ? undefined : input.preferredProvider;
  const preferredProvider =
    explicitPreferred ?? (externalProvidersEnabled ? configuredProvider : undefined);

  const selection = selectTransformationProvider({
    operations: preset.operations,
    outputFormat: preset.outputFormat,
    requiresPersistentOutput: input.persist,
    preferredProvider,
    externalProvidersEnabled,
    capabilities: CAPABILITIES,
  });

  const variants = new VariantRepository(db);
  const jobs = new ProcessingJobRepository(db);

  async function outcomeForExisting(
    existing: ImageVariant,
    assetRef: { id: string; projectId: string },
  ): Promise<RequestVariantOutcome> {
    if (existing.status === "ready") {
      return { status: "ready", variant: existing, processingJobId: null };
    }
    const relatedJobs = await jobs.list({
      projectId: assetRef.projectId,
      assetId: assetRef.id,
      type: "generate-variant",
    });
    const matchingJob = relatedJobs.find(
      (job) => job.input.type === "generate-variant" && job.input.presetHash === presetHash,
    );
    if (existing.status === "pending" || existing.status === "processing") {
      return { status: "pending", variant: existing, processingJobId: matchingJob?.id ?? null };
    }
    // status === "failed": surfaced as-is; retry goes through POST /v1/processing-jobs/:jobId/retry.
    return { status: "failed", variant: existing, processingJobId: matchingJob?.id ?? null };
  }

  const assetRef = { id: asset.id, projectId: asset.projectId };
  const existing = await variants.findByAssetAndPresetHash(asset.id, presetHash);
  if (existing) return outcomeForExisting(existing, assetRef);

  const service = new VariantPersistenceService(db);
  try {
    const { variantId, processingJobId } = await service.createVariantWithJob(
      { assetId: asset.id, presetId: preset.id, presetHash, provider: selection.provider, status: "pending" },
      {
        projectId: asset.projectId,
        type: "generate-variant",
        input: { type: "generate-variant", assetId: asset.id, presetId: preset.id, presetHash, persist: input.persist },
      },
    );

    const variant = await variants.findById(variantId);
    if (!variant) throw new Error("failed to read back newly created variant");
    return { status: "created", variant, processingJobId };
  } catch (error) {
    // Two genuinely simultaneous requests can both pass the read-before-write check above before
    // either has committed — `idx_variants_unique_asset_preset_hash` is the real backstop, and the
    // loser must still get the normal idempotent response, not a raw 409 for doing nothing wrong.
    if (error instanceof DuplicateVariantError) {
      const nowExisting = await variants.findByAssetAndPresetHash(asset.id, presetHash);
      if (nowExisting) return outcomeForExisting(nowExisting, assetRef);
    }
    throw error;
  }
}
