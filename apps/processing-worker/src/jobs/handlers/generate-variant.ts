import {
  MIME_TYPE_TO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  type ProcessingJobInput,
  type ProcessingJobResult,
  type SupportedImageExtension,
} from "@imageryx/contracts";

type GenerateVariantInput = Extract<ProcessingJobInput, { type: "generate-variant" }>;
type GenerateVariantResult = Extract<ProcessingJobResult, { type: "generate-variant" }>;
import {
  AssetActivityRepository,
  AssetRepository,
  PresetRepository,
  VariantRepository,
} from "@imageryx/database";
import {
  buildDerivedStorageKey,
  computeSha256Checksum,
  renderSimulatedVariantSvg,
} from "@imageryx/image-core";
import { createTransformationProvider, readStorageBodyToBytes } from "@imageryx/providers";
import type { ProcessingDeps } from "../deps";
import { DeletedAssetError, MissingResourceError } from "../errors";

function extensionFromMimeType(mimeType: string): SupportedImageExtension {
  const candidates =
    MIME_TYPE_TO_EXTENSIONS[mimeType as keyof typeof MIME_TYPE_TO_EXTENSIONS];
  const supported = candidates?.find((ext) =>
    SUPPORTED_IMAGE_EXTENSIONS.includes(ext),
  );
  return supported ?? "jpeg";
}

/**
 * Generates a variant for an asset. The `mock` provider renders a real SVG
 * derivative locally; the `cloudinary` provider uploads the source bytes to
 * Cloudinary, applies the mapped transformation, fetches the resulting bytes,
 * and persists them in Imageryx/R2. `cloudflare` still throws because it is
 * not wired up yet. The handler never fakes a completed transformation.
 */
export async function handleGenerateVariant(
  deps: ProcessingDeps,
  input: GenerateVariantInput,
): Promise<GenerateVariantResult> {
  const assets = new AssetRepository(deps.db);
  const presets = new PresetRepository(deps.db);
  const variants = new VariantRepository(deps.db);
  const activity = new AssetActivityRepository(deps.db);

  const asset = await assets.findById(input.assetId);
  if (!asset) {
    throw new MissingResourceError(`asset "${input.assetId}" was not found`);
  }
  if (asset.deletedAt) {
    throw new DeletedAssetError(`asset "${input.assetId}" is deleted`);
  }

  const preset = await presets.findById(input.presetId);
  if (!preset) {
    throw new MissingResourceError(`preset "${input.presetId}" was not found`);
  }

  const variant = await variants.findByAssetAndPresetHash(asset.id, input.presetHash);
  if (!variant) {
    throw new MissingResourceError(
      `variant for asset "${input.assetId}" and preset hash "${input.presetHash}" was not found`,
    );
  }

  await variants.update(variant.id, { status: "processing" });
  await activity.record({
    assetId: asset.id,
    projectId: asset.projectId,
    event: "variant.processing",
    metadata: { variantId: variant.id, presetId: preset.id },
  });

  const sourceObject = await deps.storage.get(asset.storageKey);
  if (!sourceObject) {
    throw new MissingResourceError(
      `original bytes for asset "${asset.id}" were not found in storage`,
    );
  }
  const sourceBytes = await readStorageBodyToBytes(sourceObject.body);

  const provider = createTransformationProvider(variant.provider, {
    cloudinary: deps.cloudinary,
  });

  try {
    const transformed = await provider.transform({
      assetId: asset.id,
      assetSlug: asset.slug,
      sourceBytes,
      sourceWidth: asset.width,
      sourceHeight: asset.height,
      sourceMimeType: asset.mimeType,
      operations: preset.operations,
      outputFormat: preset.outputFormat,
      quality: preset.quality,
      presetHash: input.presetHash,
    });

    if (!transformed.simulated) {
      let storageKey: string | null = null;
      if (input.persist && transformed.bytes && transformed.bytes.byteLength > 0) {
        const extension = extensionFromMimeType(transformed.mimeType);
        storageKey = buildDerivedStorageKey(
          asset.projectId,
          asset.id,
          input.presetHash,
          extension,
        );
        await deps.storage.put({
          key: storageKey,
          body: transformed.bytes,
          contentType: transformed.mimeType,
        });
      }

      await variants.update(variant.id, {
        status: "ready",
        storageKey,
        deliveryUrl: transformed.deliveryUrl,
        mimeType: transformed.mimeType,
        width: transformed.width,
        height: transformed.height,
        sizeBytes: transformed.sizeBytes,
        checksum: transformed.checksum,
      });
      await activity.record({
        assetId: asset.id,
        projectId: asset.projectId,
        event: "variant.ready",
        metadata: { variantId: variant.id, simulated: false },
      });

      return {
        type: "generate-variant",
        variantId: variant.id,
        storageKey,
        width: transformed.width,
        height: transformed.height,
        sizeBytes: transformed.sizeBytes,
      };
    }

    // The mock provider's own `mimeType`/`sizeBytes`/`deliveryUrl` are fabricated numbers, not
    // real bytes — this handler only reuses its deterministic width/height derivation, then
    // renders and stores a real SVG image so the variant is a genuine, valid image response
    // (see context.md's "Mock variant content" note), never JSON pretending to be one.
    const outputFormatLabel =
      preset.outputFormat === "auto" ? "auto (webp)" : preset.outputFormat;
    const svg = renderSimulatedVariantSvg({
      assetName: asset.name,
      presetName: preset.name,
      width: transformed.width ?? 100,
      height: transformed.height ?? 100,
      outputFormat: outputFormatLabel,
    });
    const svgBytes = new TextEncoder().encode(svg);
    const checksum = await computeSha256Checksum(svgBytes);

    let storageKey: string | null = null;
    if (input.persist) {
      storageKey = buildDerivedStorageKey(
        asset.projectId,
        asset.id,
        input.presetHash,
        "svg",
      );
      await deps.storage.put({
        key: storageKey,
        body: svgBytes,
        contentType: "image/svg+xml",
      });
    }

    await variants.update(variant.id, {
      status: "ready",
      storageKey,
      deliveryUrl: null,
      mimeType: "image/svg+xml",
      width: transformed.width,
      height: transformed.height,
      sizeBytes: svgBytes.byteLength,
      checksum,
    });
    await activity.record({
      assetId: asset.id,
      projectId: asset.projectId,
      event: "variant.ready",
      metadata: { variantId: variant.id, simulated: true },
    });

    return {
      type: "generate-variant",
      variantId: variant.id,
      storageKey,
      width: transformed.width,
      height: transformed.height,
      sizeBytes: svgBytes.byteLength,
    };
  } catch (error) {
    await variants.update(variant.id, { status: "failed" });
    await activity.record({
      assetId: asset.id,
      projectId: asset.projectId,
      event: "processing.failed",
      metadata: {
        variantId: variant.id,
        error: error instanceof Error ? error.message : "unknown error",
      },
    });
    throw error;
  }
}
