import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const VALUE_PRECISION = 2;
const PRECISION_FACTOR = 10 ** VALUE_PRECISION;

function roundToPrecision(value: number): number {
  return Math.round(value * PRECISION_FACTOR) / PRECISION_FACTOR;
}

/** Lowercases hex colors and expands `#rgb`/`#rgba` shorthand to `#rrggbb`/`#rrggbbaa` so equivalent colors always normalize identically. */
function normalizeColor(color: string): string {
  if (color === "transparent") return color;
  const match = HEX_COLOR_PATTERN.exec(color);
  if (!match) return color.toLowerCase();

  const hex = match[1] ?? "";
  const lower = hex.toLowerCase();
  if (lower.length === 3) {
    return `#${lower[0]}${lower[0]}${lower[1]}${lower[1]}${lower[2]}${lower[2]}`;
  }
  return `#${lower}`;
}

/**
 * Rebuilds each operation with only its meaningful fields, in a fixed key
 * order, so two structurally-equivalent definitions (an omitted optional
 * field vs. its explicit default value) normalize identically before
 * hashing. Operation *order* is preserved as-is — order is semantically
 * significant for an image pipeline (crop-then-rotate differs from
 * rotate-then-crop), so normalization never reorders the array.
 */
function normalizeOperation(operation: ImageOperation): ImageOperation {
  switch (operation.type) {
    case "resize":
      return {
        type: "resize",
        ...(operation.width !== undefined ? { width: operation.width } : {}),
        ...(operation.height !== undefined ? { height: operation.height } : {}),
        fit: operation.fit,
        ...(operation.position !== undefined
          ? { position: operation.position }
          : {}),
        ...(operation.withoutEnlargement
          ? { withoutEnlargement: true as const }
          : {}),
      };
    case "crop":
      return {
        type: "crop",
        x: operation.x,
        y: operation.y,
        width: operation.width,
        height: operation.height,
      };
    case "rotate":
      return { type: "rotate", degrees: operation.degrees };
    case "flip":
      return {
        type: "flip",
        horizontal: operation.horizontal,
        vertical: operation.vertical,
      };
    case "format":
      return { type: "format", format: operation.format };
    case "quality":
      return { type: "quality", value: operation.value };
    case "background":
      return { type: "background", color: normalizeColor(operation.color) };
    case "blur":
      return { type: "blur", value: roundToPrecision(operation.value) };
    case "sharpen":
      return { type: "sharpen", value: roundToPrecision(operation.value) };
    case "grayscale":
      return { type: "grayscale", enabled: true };
    case "metadata":
      return { type: "metadata", mode: operation.mode };
  }
}

export interface NormalizedPreset {
  operations: readonly ImageOperation[];
  outputFormat: OutputImageFormat;
  quality: number | null;
}

export function normalizePreset(input: {
  operations: readonly ImageOperation[];
  outputFormat: OutputImageFormat;
  quality?: number | null;
}): NormalizedPreset {
  return {
    operations: input.operations.map(normalizeOperation),
    outputFormat: input.outputFormat,
    quality: input.quality ?? null,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic across key-insertion order — object keys are sorted recursively before serialization. */
export function canonicalPresetJson(preset: NormalizedPreset): string {
  return JSON.stringify(canonicalize(preset));
}
