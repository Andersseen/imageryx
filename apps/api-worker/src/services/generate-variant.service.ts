import type { ImageVariant, PreferredProvider } from "@imageryx/contracts";
import {
  AssetRepository,
  PresetRepository,
  ProcessingJobRepository,
  VariantPersistenceService,
  VariantRepository,
  type D1Client,
} from "@imageryx/database";
import {
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

  const selection = selectTransformationProvider({
    operations: preset.operations,
    outputFormat: preset.outputFormat,
    requiresPersistentOutput: input.persist,
    preferredProvider: input.preferredProvider === "auto" ? undefined : input.preferredProvider,
    // Phase 3's default/local configuration only ever enables the mock provider for real work —
    // see context.md's Cloudflare/Cloudinary adapter state notes.
    externalProvidersEnabled: false,
    capabilities: CAPABILITIES,
  });

  const variants = new VariantRepository(db);
  const jobs = new ProcessingJobRepository(db);
  const existing = await variants.findByAssetAndPresetHash(asset.id, presetHash);

  if (existing) {
    if (existing.status === "ready") {
      return { status: "ready", variant: existing, processingJobId: null };
    }
    const relatedJobs = await jobs.list({
      projectId: asset.projectId,
      assetId: asset.id,
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

  const service = new VariantPersistenceService(db);
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
}
