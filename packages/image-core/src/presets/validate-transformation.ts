import {
  MAX_DIMENSION,
  MAX_OPERATIONS_PER_PRESET,
  type ImageOperation,
  type OutputImageFormat,
} from "@imageryx/contracts";
import { InvalidPresetError } from "../errors/domain-errors";

const DIMENSION_DEPENDENT_FITS = new Set(["cover", "crop", "pad"]);

/**
 * Structural/asset-independent checks only. A true "impossible crop"
 * (crop rectangle larger than the source image) can only be detected once
 * an asset's actual width/height are known, which happens at
 * variant-generation time, not here — this only rejects crop bounds that
 * could never be valid regardless of source image size.
 */
export function validateTransformationChain(
  operations: readonly ImageOperation[],
): void {
  if (operations.length > MAX_OPERATIONS_PER_PRESET) {
    throw new InvalidPresetError(
      `a preset may not define more than ${MAX_OPERATIONS_PER_PRESET} operations`,
    );
  }

  const seenTypes = new Set<string>();
  for (const operation of operations) {
    if (seenTypes.has(operation.type)) {
      throw new InvalidPresetError(
        `duplicate "${operation.type}" operation — each operation type may appear at most once per preset`,
      );
    }
    seenTypes.add(operation.type);

    if (
      operation.type === "resize" &&
      DIMENSION_DEPENDENT_FITS.has(operation.fit)
    ) {
      if (operation.width === undefined || operation.height === undefined) {
        throw new InvalidPresetError(
          `resize fit "${operation.fit}" requires both width and height`,
        );
      }
    }

    if (operation.type === "crop") {
      if (
        operation.x + operation.width > MAX_DIMENSION * 2 ||
        operation.y + operation.height > MAX_DIMENSION * 2
      ) {
        throw new InvalidPresetError(
          "crop bounds exceed the maximum representable image dimensions",
        );
      }
    }
  }
}

export interface PresetSemanticsInput {
  operations: readonly ImageOperation[];
  outputFormat: OutputImageFormat;
  quality: number | null;
}

/** Cross-checks operations against the preset's own top-level `outputFormat`/`quality`, on top of `validateTransformationChain`'s per-array checks. */
export function validatePresetSemantics(preset: PresetSemanticsInput): void {
  validateTransformationChain(preset.operations);

  const formatOperation = preset.operations.find(
    (operation) => operation.type === "format",
  );
  if (
    formatOperation &&
    formatOperation.type === "format" &&
    formatOperation.format !== preset.outputFormat
  ) {
    throw new InvalidPresetError(
      'a "format" operation must match the preset\'s outputFormat, or be omitted',
    );
  }

  const qualityOperation = preset.operations.find(
    (operation) => operation.type === "quality",
  );
  if (
    qualityOperation &&
    qualityOperation.type === "quality" &&
    preset.quality !== null &&
    qualityOperation.value !== preset.quality
  ) {
    throw new InvalidPresetError(
      'a "quality" operation must match the preset\'s quality, or be omitted',
    );
  }
}
