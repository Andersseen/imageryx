import type { ProcessingJobInput, ProcessingJobResult } from "@imageryx/contracts";

type InspectMetadataInput = Extract<ProcessingJobInput, { type: "inspect-metadata" }>;
type InspectMetadataResult = Extract<ProcessingJobResult, { type: "inspect-metadata" }>;
import { AssetActivityRepository, AssetRepository } from "@imageryx/database";
import {
  approximateDominantColorFromChecksum,
  buildColorPlaceholderDataUri,
  computeAspectRatio,
  computeSha256Checksum,
  inspectImageDimensions,
  StorageObjectNotFoundError,
} from "@imageryx/image-core";
import type { ProcessingDeps } from "../deps";
import { DeletedAssetError, MissingResourceError } from "../errors";
import { streamToBytes } from "../stream";

/**
 * Loads the stored original, parses dimensions/alpha from its header
 * bytes (see `@imageryx/image-core`'s `inspectImageDimensions`), computes
 * a deterministic placeholder, and transitions the asset to `ready`.
 * Never invents a dimension: an unparseable header leaves width/height
 * `null` and the asset still becomes `ready` (see context.md).
 */
export async function handleInspectMetadata(
  deps: ProcessingDeps,
  input: InspectMetadataInput,
): Promise<InspectMetadataResult> {
  const assets = new AssetRepository(deps.db);
  const activity = new AssetActivityRepository(deps.db);

  const asset = await assets.findById(input.assetId);
  if (!asset) {
    throw new MissingResourceError(`asset "${input.assetId}" was not found`);
  }
  if (asset.deletedAt) {
    throw new DeletedAssetError(`asset "${input.assetId}" is deleted`);
  }

  const object = await deps.storage.get(asset.storageKey);
  if (!object) {
    throw new StorageObjectNotFoundError(
      `no stored object exists for asset "${input.assetId}"`,
    );
  }
  const bytes = await streamToBytes(object.body);

  const dimensions = inspectImageDimensions(asset.mimeType, bytes);
  const aspectRatio = computeAspectRatio(dimensions.width, dimensions.height);
  const dominantColor = approximateDominantColorFromChecksum(asset.checksum);
  const placeholder = buildColorPlaceholderDataUri(dominantColor);

  const recomputedChecksum = await computeSha256Checksum(bytes);
  const warnings = [...dimensions.warnings];
  if (recomputedChecksum !== asset.checksum) {
    warnings.push("checksum-mismatch-on-inspection");
  }

  await assets.update(asset.id, {
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio,
    hasAlpha: dimensions.hasAlpha,
    dominantColor,
    placeholder,
    processingStatus: "ready",
  });

  await activity.record({
    assetId: asset.id,
    projectId: asset.projectId,
    event: "asset.metadata_inspected",
    metadata: { warnings, width: dimensions.width, height: dimensions.height },
  });
  await activity.record({
    assetId: asset.id,
    projectId: asset.projectId,
    event: "asset.ready",
  });

  return {
    type: "inspect-metadata",
    width: dimensions.width,
    height: dimensions.height,
    hasAlpha: dimensions.hasAlpha,
    dominantColor,
  };
}
