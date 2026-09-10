import type {
  ImagesBinding,
  ImageTransform,
  ReadableStream as CfReadableStream,
} from "@cloudflare/workers-types";
import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";
import {
  computeSha256Checksum,
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
 * Cloudflare Images' standard resizing API has no pixel-offset manual
 * crop (its `fit: 'crop'` is a gravity-based auto-crop-to-fit strategy,
 * not an arbitrary x/y/width/height rectangle), no grayscale parameter,
 * and — confirmed against the real `ImageTransform`/`ImageOutputOptions`
 * types shipped in `@cloudflare/workers-types` (not assumed) — no
 * metadata/EXIF control at all. All three are real capability gaps, not
 * oversights — a preset needing any of them is routed to Cloudinary by
 * provider selection instead.
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
  ],
  supportedOutputFormats: ["auto", "avif", "webp", "jpeg", "png"],
  supportsPersistentOutput: true,
  supportsRemoteSources: false,
  supportsDynamicDelivery: false,
};

const FIT_MAP: Record<string, ImageTransform["fit"]> = {
  cover: "cover",
  contain: "contain",
  "scale-down": "scale-down",
  crop: "crop",
  pad: "pad",
};

const GRAVITY_MAP: Record<string, ImageTransform["gravity"]> = {
  center: "center",
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
  "top-left": { x: 0, y: 0, mode: "box-center" },
  "top-right": { x: 1, y: 0, mode: "box-center" },
  "bottom-left": { x: 0, y: 1, mode: "box-center" },
  "bottom-right": { x: 1, y: 1, mode: "box-center" },
};

const OUTPUT_FORMAT_MIME_MAP: Record<
  Exclude<OutputImageFormat, "auto" | "svg">,
  "image/avif" | "image/webp" | "image/jpeg" | "image/png"
> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
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

export interface CloudflareMappedOptions {
  /** Passed to `ImageTransformer.transform()` — geometry/effects. */
  transform: ImageTransform;
  /** Passed to `ImageTransformer.output()` — format/quality/alpha-fill. `format` is a MIME type, matching the real binding's `ImageOutputOptions` shape. */
  output: {
    format: "image/avif" | "image/webp" | "image/jpeg" | "image/png";
    quality?: number;
    background?: string;
  };
}

/**
 * Pure mapping from domain operations to the real Workers Images Binding
 * shape (`env.IMAGES.input(...).transform(...).output(...)`) — never makes
 * a request. Split into `transform` (geometry/effects, applied mid-chain)
 * and `output` (format/quality, applied once at the end) because that's
 * how the real binding's API is shaped — the old `cf.image`/
 * `/cdn-cgi/image/` URL API this used to target was a single flat
 * parameter list, but the binding is not.
 *
 * Throws `UnsupportedOperationError` for operations Cloudflare cannot
 * perform (crop, grayscale, metadata) rather than silently dropping them.
 * `outputFormat: "auto"` has no request-time Accept-header signal to
 * negotiate against here (this runs during async job processing, not a
 * live HTTP response), so it resolves to `autoFormat` (default webp) —
 * same policy as `MockTransformationProvider`.
 */
export function mapOperationsToCloudflareOptions(
  operations: readonly ImageOperation[],
  outputFormat: OutputImageFormat,
  quality: number | null,
  autoFormat: Exclude<OutputImageFormat, "auto" | "svg"> = "webp",
): CloudflareMappedOptions {
  assertSupported(operations);

  if (outputFormat === "svg") {
    throw new UnsupportedOperationError(
      "Cloudflare Images does not produce svg output",
      ["format:svg"],
    );
  }

  const transform: ImageTransform = {};
  let background: string | undefined;

  for (const operation of operations) {
    switch (operation.type) {
      case "resize": {
        if (operation.width !== undefined) transform.width = operation.width;
        if (operation.height !== undefined) transform.height = operation.height;
        transform.fit = FIT_MAP[operation.fit];
        if (operation.position)
          transform.gravity = GRAVITY_MAP[operation.position];
        break;
      }
      case "rotate": {
        if (operation.degrees !== 0) transform.rotate = operation.degrees;
        break;
      }
      case "flip": {
        if (operation.horizontal && operation.vertical) transform.flip = "hv";
        else if (operation.horizontal) transform.flip = "h";
        else if (operation.vertical) transform.flip = "v";
        break;
      }
      case "background": {
        background =
          operation.color === "transparent" ? undefined : operation.color;
        if (background) transform.background = background;
        break;
      }
      case "blur": {
        transform.blur = mapCloudflareBlurValue(operation.value);
        break;
      }
      case "sharpen": {
        transform.sharpen = mapCloudflareSharpenValue(operation.value);
        break;
      }
      case "format":
      case "quality":
        // Handled below via the top-level outputFormat/quality — a `format`/`quality`
        // *operation* is required (by `validatePresetSemantics`) to match the preset's own
        // top-level fields, so there is nothing extra to read from the operation itself.
        break;
      default:
        break;
    }
  }

  const resolvedFormat = outputFormat === "auto" ? autoFormat : outputFormat;

  return {
    transform,
    output: {
      format: OUTPUT_FORMAT_MIME_MAP[resolvedFormat],
      ...(quality !== null ? { quality } : {}),
      ...(background ? { background } : {}),
    },
  };
}

export interface CloudflareImagesProviderOptions {
  /** The real `env.IMAGES` Workers binding. Required — there is no other way to construct a working provider. */
  images?: ImagesBinding | null;
  /** What `outputFormat: 'auto'` resolves to (no Accept-header signal available during async job processing). Defaults to `'webp'`, matching `MockTransformationProvider`. */
  autoFormat?: Exclude<OutputImageFormat, "auto" | "svg">;
}

/**
 * Same cross-runtime ambient type friction as `r2-storage.provider.ts`
 * (see its "ambient type friction" comment): the standard lib's
 * `ReadableStream` and `@cloudflare/workers-types`' declared global one
 * are structurally close but not identical, so `ImagesBinding.input()`
 * rejects a plain `Blob.stream()` result at the type level even though
 * it's the exact right value at runtime (this only ever executes inside a
 * Worker).
 */
async function toStream(
  bytes: Uint8Array,
): Promise<CfReadableStream<Uint8Array>> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer]).stream() as unknown as CfReadableStream<Uint8Array>;
}

/**
 * Real Cloudflare Images transformation provider, backed by the Workers
 * Images Binding (`[images] binding = "IMAGES"` in wrangler config —
 * `env.IMAGES.input(stream).transform(...).output(...)`), not the
 * zone-based `cf.image`/`/cdn-cgi/image/` Image Resizing feature. The
 * binding accepts a stream directly (works naturally with bytes already
 * fetched from R2), needs no Cloudflare zone or Pro plan, and is billed as
 * "Images Transformed" (5,000 free unique transforms/month, then
 * $0.50/1,000 — confirmed on developers.cloudflare.com/images/pricing).
 */
export class CloudflareImagesProvider implements TransformationProvider {
  readonly name = "cloudflare" as const;
  readonly capabilities = CLOUDFLARE_CAPABILITIES;
  private readonly images: ImagesBinding | null;
  private readonly autoFormat: Exclude<OutputImageFormat, "auto" | "svg">;

  constructor(options: CloudflareImagesProviderOptions = {}) {
    this.images = options.images ?? null;
    this.autoFormat = options.autoFormat ?? "webp";
  }

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

  async transform(input: TransformationInput): Promise<TransformationResult> {
    if (!this.images) {
      throw new ProviderUnavailableError(
        "Cloudflare Images provider requires the IMAGES Workers binding — pass it via options.images",
      );
    }
    if (!input.sourceBytes || input.sourceBytes.byteLength === 0) {
      throw new ProviderUnavailableError(
        "Cloudflare Images transform requires source bytes",
      );
    }

    const { transform, output } = mapOperationsToCloudflareOptions(
      input.operations,
      input.outputFormat,
      input.quality,
      this.autoFormat,
    );

    const sourceStream = await toStream(input.sourceBytes);
    const result = await this.images
      .input(sourceStream)
      .transform(transform)
      .output(output);
    const response = result.response();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? output.format;

    // `.info()` calls are free and give the *actual* output dimensions rather than a guess —
    // the transform/output chain above never reports them directly.
    let width: number | null = null;
    let height: number | null = null;
    try {
      const info = await this.images.info(await toStream(bytes));
      if ("width" in info && "height" in info) {
        width = info.width;
        height = info.height;
      }
    } catch {
      // Dimensions are a best-effort enrichment — a transform that already succeeded should
      // still be persisted even if this follow-up metadata call fails.
    }

    const checksum = await computeSha256Checksum(bytes);

    return {
      providerOperationId: `cloudflare-${input.assetId}-${input.presetHash}`,
      mimeType,
      width,
      height,
      sizeBytes: bytes.byteLength,
      checksum,
      deliveryUrl: null,
      storageKey: null,
      bytes,
      simulated: false,
    };
  }
}
