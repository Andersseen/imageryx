import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";
import {
  ProviderUnavailableError,
  UnsupportedOperationError,
  type TransformationProviderCapabilities,
} from "@imageryx/image-core";
import type {
  ProviderSupportResult,
  TransformationInput,
  TransformationProvider,
  TransformationResult,
} from "./transformation-provider";

/**
 * Shape of Cloudflare's `cf.image` fetch option / `/cdn-cgi/image/` URL
 * parameters this adapter targets. Only the fields this mapper actually
 * produces are declared — not the full documented surface — so nothing
 * here silently claims support for options it doesn't map.
 */
export interface CloudflareImageOptions {
  width?: number;
  height?: number;
  fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
  gravity?:
    | "auto"
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "center"
    | { x: number; y: number };
  quality?: number;
  format?: Exclude<OutputImageFormat, "auto">;
  background?: string;
  blur?: number;
  sharpen?: number;
  rotate?: 90 | 180 | 270;
  flip?: "h" | "v" | "hv";
  metadata?: "keep" | "none";
}

/**
 * Cloudflare Images' standard resizing API has no pixel-offset manual
 * crop (its `fit: 'crop'` is a gravity-based auto-crop-to-fit strategy,
 * not an arbitrary x/y/width/height rectangle) and no grayscale
 * parameter. Both are real capability gaps, not oversights — a preset
 * needing either is routed to Cloudinary by provider selection instead.
 */
export const CLOUDFLARE_CAPABILITIES: TransformationProviderCapabilities = {
  provider: "cloudflare",
  supportedOperations: [
    "resize",
    "rotate",
    "flip",
    "format",
    "quality",
    "background",
    "blur",
    "sharpen",
    "metadata",
  ],
  supportedOutputFormats: ["auto", "avif", "webp", "jpeg", "png"],
  supportsPersistentOutput: false,
  supportsRemoteSources: true,
  supportsDynamicDelivery: true,
};

const FIT_MAP: Record<string, CloudflareImageOptions["fit"]> = {
  cover: "cover",
  contain: "contain",
  "scale-down": "scale-down",
  crop: "crop",
  pad: "pad",
};

const GRAVITY_MAP: Record<string, CloudflareImageOptions["gravity"]> = {
  center: "center",
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
  "top-left": { x: 0, y: 0 },
  "top-right": { x: 1, y: 0 },
  "bottom-left": { x: 0, y: 1 },
  "bottom-right": { x: 1, y: 1 },
};

/** Domain blur is a normalized 0-100 range; Cloudflare's documented radius range is 1-250. Linear mapping, clamped. */
export function mapCloudflareBlurValue(domainValue: number): number {
  return Math.round(1 + (Math.min(100, Math.max(0, domainValue)) / 100) * 249);
}

/** Domain sharpen is a normalized 0-100 range; Cloudflare's documented range is roughly 0-10. Linear mapping, one decimal of precision. */
export function mapCloudflareSharpenValue(domainValue: number): number {
  return (
    Math.round((Math.min(100, Math.max(0, domainValue)) / 100) * 10 * 10) / 10
  );
}

function assertSupported(operations: readonly ImageOperation[]): void {
  const unsupported = operations
    .map((op) => op.type)
    .filter(
      (type) => !CLOUDFLARE_CAPABILITIES.supportedOperations.includes(type),
    );
  if (unsupported.length > 0) {
    throw new UnsupportedOperationError(
      `Cloudflare Images does not support: ${unsupported.join(", ")}`,
      unsupported,
    );
  }
}

/**
 * Pure mapping from domain operations to Cloudflare's option shape — never
 * makes a request. Throws `UnsupportedOperationError` for operations
 * Cloudflare cannot perform (crop, grayscale) rather than silently
 * dropping them, and for the one `metadata` mode Cloudflare has no
 * equivalent for (`strip-location`: Cloudflare can only keep everything
 * or strip everything, not GPS-only).
 */
export function mapOperationsToCloudflareOptions(
  operations: readonly ImageOperation[],
  outputFormat: OutputImageFormat,
  quality: number | null,
): CloudflareImageOptions {
  assertSupported(operations);

  const options: CloudflareImageOptions = {};

  for (const operation of operations) {
    switch (operation.type) {
      case "resize": {
        if (operation.width !== undefined) options.width = operation.width;
        if (operation.height !== undefined) options.height = operation.height;
        options.fit = FIT_MAP[operation.fit];
        if (operation.position)
          options.gravity = GRAVITY_MAP[operation.position];
        break;
      }
      case "rotate": {
        if (operation.degrees !== 0) options.rotate = operation.degrees;
        break;
      }
      case "flip": {
        if (operation.horizontal && operation.vertical) options.flip = "hv";
        else if (operation.horizontal) options.flip = "h";
        else if (operation.vertical) options.flip = "v";
        break;
      }
      case "format": {
        if (operation.format !== "auto") options.format = operation.format;
        break;
      }
      case "quality": {
        options.quality = operation.value;
        break;
      }
      case "background": {
        options.background = operation.color;
        break;
      }
      case "blur": {
        options.blur = mapCloudflareBlurValue(operation.value);
        break;
      }
      case "sharpen": {
        options.sharpen = mapCloudflareSharpenValue(operation.value);
        break;
      }
      case "metadata": {
        if (operation.mode === "strip-location") {
          throw new UnsupportedOperationError(
            'Cloudflare Images has no location-only metadata strip — only "keep" (all) or "none" (strip all)',
            ["metadata"],
          );
        }
        options.metadata = operation.mode === "keep" ? "keep" : "none";
        break;
      }
      default:
        break;
    }
  }

  if (outputFormat !== "auto" && options.format === undefined) {
    options.format = outputFormat;
  }
  if (quality !== null && options.quality === undefined) {
    options.quality = quality;
  }

  return options;
}

/**
 * Structural adapter over the mapping functions above. `transform()`
 * deliberately throws rather than issuing a real request — Phase 2
 * excludes real Cloudflare Images calls entirely; this class exists so
 * `ProviderRegistry` has something conforming to `TransformationProvider`
 * to select once a real HTTP call is wired up in a later phase.
 */
export class CloudflareImagesProvider implements TransformationProvider {
  readonly name = "cloudflare" as const;
  readonly capabilities = CLOUDFLARE_CAPABILITIES;

  supports(
    operations: readonly ImageOperation[],
    outputFormat: OutputImageFormat,
  ): ProviderSupportResult {
    const unsupportedOperations = operations
      .map((op) => op.type)
      .filter((type) => !this.capabilities.supportedOperations.includes(type));
    const unsupportedOutputFormat =
      !this.capabilities.supportedOutputFormats.includes(outputFormat);
    return {
      supported: unsupportedOperations.length === 0 && !unsupportedOutputFormat,
      unsupportedOperations,
      unsupportedOutputFormat,
    };
  }

  // `async` is intentional here (with no `await`) so a synchronous throw still rejects the
  // returned Promise, matching every other TransformationProvider.transform()'s contract for
  // callers that chain `.catch()`.
  async transform(_input: TransformationInput): Promise<TransformationResult> {
    throw new ProviderUnavailableError(
      "Cloudflare Images network calls are not implemented until a later phase",
    );
  }
}
