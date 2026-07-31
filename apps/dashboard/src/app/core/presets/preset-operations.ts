import type {
  ImageOperation,
  ImagePosition,
  MetadataMode,
  OutputImageFormat,
  ResizeFit,
  RotationDegrees,
} from "@imageryx/contracts";

/**
 * The preset editor's form state, flattened to one object with an `enabled` toggle per optional
 * operation — a shape the template can bind to directly, distinct from `ImageOperation[]`, which
 * is a sparse array of only the operations actually present.
 */
export interface PresetFormOperations {
  resizeEnabled: boolean;
  width: number | null;
  height: number | null;
  fit: ResizeFit;
  position: ImagePosition | null;
  withoutEnlargement: boolean;

  cropEnabled: boolean;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;

  rotateEnabled: boolean;
  rotateDegrees: RotationDegrees;

  flipHorizontal: boolean;
  flipVertical: boolean;

  backgroundEnabled: boolean;
  backgroundColor: string;

  metadataMode: MetadataMode;

  blurEnabled: boolean;
  blurValue: number;

  sharpenEnabled: boolean;
  sharpenValue: number;

  grayscaleEnabled: boolean;
}

export const DEFAULT_PRESET_FORM_OPERATIONS: PresetFormOperations = {
  resizeEnabled: true,
  width: 800,
  height: null,
  fit: "cover",
  position: null,
  withoutEnlargement: true,
  cropEnabled: false,
  cropX: 0,
  cropY: 0,
  cropWidth: 100,
  cropHeight: 100,
  rotateEnabled: false,
  rotateDegrees: 90,
  flipHorizontal: false,
  flipVertical: false,
  backgroundEnabled: false,
  backgroundColor: "#ffffff",
  metadataMode: "keep",
  blurEnabled: false,
  blurValue: 20,
  sharpenEnabled: false,
  sharpenValue: 20,
  grayscaleEnabled: false,
};

/**
 * The fixed order operations are assembled in — arbitrary as a *pipeline* (the domain preserves
 * whatever order it's given; see ARCHITECTURE.md's "Preset normalization and hashing" — it never
 * reorders operations), but held constant here so the same form state always serializes to the
 * same array, and so a preset's `operations` field, once saved, is a truthful "resulting chain"
 * rather than something that could vary run to run.
 */
export function buildPresetOperations(
  form: PresetFormOperations,
): ImageOperation[] {
  const operations: ImageOperation[] = [];

  if (form.resizeEnabled && (form.width !== null || form.height !== null)) {
    operations.push({
      type: "resize",
      width: form.width ?? undefined,
      height: form.height ?? undefined,
      fit: form.fit,
      position: form.position ?? undefined,
      withoutEnlargement: form.withoutEnlargement,
    });
  }

  if (form.cropEnabled) {
    operations.push({
      type: "crop",
      x: form.cropX,
      y: form.cropY,
      width: form.cropWidth,
      height: form.cropHeight,
    });
  }

  if (form.rotateEnabled) {
    operations.push({ type: "rotate", degrees: form.rotateDegrees });
  }

  if (form.flipHorizontal || form.flipVertical) {
    operations.push({
      type: "flip",
      horizontal: form.flipHorizontal,
      vertical: form.flipVertical,
    });
  }

  if (form.grayscaleEnabled) {
    operations.push({ type: "grayscale", enabled: true });
  }

  if (form.blurEnabled) {
    operations.push({ type: "blur", value: form.blurValue });
  }

  if (form.sharpenEnabled) {
    operations.push({ type: "sharpen", value: form.sharpenValue });
  }

  if (form.backgroundEnabled) {
    operations.push({ type: "background", color: form.backgroundColor });
  }

  if (form.metadataMode !== "keep") {
    operations.push({ type: "metadata", mode: form.metadataMode });
  }

  return operations;
}

/** The inverse of `buildPresetOperations` — hydrates form state from a preset's stored operations, for editing. */
export function parsePresetOperations(
  operations: readonly ImageOperation[],
): PresetFormOperations {
  const form: PresetFormOperations = {
    ...DEFAULT_PRESET_FORM_OPERATIONS,
    resizeEnabled: false,
  };

  for (const op of operations) {
    switch (op.type) {
      case "resize":
        form.resizeEnabled = true;
        form.width = op.width ?? null;
        form.height = op.height ?? null;
        form.fit = op.fit;
        form.position = op.position ?? null;
        form.withoutEnlargement = op.withoutEnlargement ?? false;
        break;
      case "crop":
        form.cropEnabled = true;
        form.cropX = op.x;
        form.cropY = op.y;
        form.cropWidth = op.width;
        form.cropHeight = op.height;
        break;
      case "rotate":
        form.rotateEnabled = true;
        form.rotateDegrees = op.degrees;
        break;
      case "flip":
        form.flipHorizontal = op.horizontal;
        form.flipVertical = op.vertical;
        break;
      case "background":
        form.backgroundEnabled = true;
        form.backgroundColor = op.color;
        break;
      case "blur":
        form.blurEnabled = true;
        form.blurValue = op.value;
        break;
      case "sharpen":
        form.sharpenEnabled = true;
        form.sharpenValue = op.value;
        break;
      case "grayscale":
        form.grayscaleEnabled = true;
        break;
      case "metadata":
        form.metadataMode = op.mode;
        break;
      // "format" and "quality" operations are never produced by this editor — the preset's own
      // top-level outputFormat/quality fields are the only place those live (see every
      // SYSTEM_PRESET_DEFINITIONS entry, none of which include a format/quality operation).
      case "format":
      case "quality":
        break;
    }
  }

  return form;
}

/** A short, human-readable summary of what a preset does — for the list and confirmation views, never raw JSON. */
export function summarizeOperations(
  operations: readonly ImageOperation[],
): string {
  if (operations.length === 0) return "No operations";

  const parts: string[] = [];
  for (const op of operations) {
    switch (op.type) {
      case "resize": {
        const dims = [op.width, op.height]
          .filter((v): v is number => v !== undefined)
          .join("×");
        parts.push(
          dims ? `Resize to ${dims} (${op.fit})` : `Resize (${op.fit})`,
        );
        break;
      }
      case "crop":
        parts.push(`Crop ${op.width}×${op.height}`);
        break;
      case "rotate":
        parts.push(`Rotate ${op.degrees}°`);
        break;
      case "flip":
        parts.push(
          [op.horizontal ? "horizontal" : null, op.vertical ? "vertical" : null]
            .filter(Boolean)
            .map((direction) => `Flip ${direction}`)
            .join(", "),
        );
        break;
      case "background":
        parts.push(`Background ${op.color}`);
        break;
      case "blur":
        parts.push("Blur");
        break;
      case "sharpen":
        parts.push("Sharpen");
        break;
      case "grayscale":
        parts.push("Grayscale");
        break;
      case "metadata":
        parts.push(`Metadata: ${op.mode}`);
        break;
      case "format":
        parts.push(`Format: ${op.format}`);
        break;
      case "quality":
        parts.push(`Quality: ${op.value}`);
        break;
    }
  }
  return parts.join(" · ");
}

export function summarizePresetOutput(
  outputFormat: OutputImageFormat,
  quality: number | null,
): string {
  return quality !== null
    ? `${outputFormat} · quality ${quality}`
    : outputFormat;
}
