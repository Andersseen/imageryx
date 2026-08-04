import {
  IMAGE_OPERATION_TYPES,
  type ImageOperation,
  type OutputImageFormat,
} from "@imageryx/contracts";
import {
  computeSha256Checksum,
  validateTransformationChain,
  type TransformationProviderCapabilities,
} from "@imageryx/image-core";
import type {
  ProviderSupportResult,
  TransformationInput,
  TransformationProvider,
  TransformationResult,
} from "./transformation-provider";

export class MockTransformationFailureError extends Error {}

const OUTPUT_FORMAT_TO_MIME: Record<
  Exclude<OutputImageFormat, "auto">,
  string
> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
};

export interface MockTransformationProviderOptions {
  /** What `outputFormat: 'auto'` resolves to. Defaults to `'webp'` — a broadly-supported, real format, so downstream code never has to special-case "auto" once it reaches this point. */
  autoFormat?: Exclude<OutputImageFormat, "auto">;
}

export const MOCK_CAPABILITIES: TransformationProviderCapabilities = {
  provider: "mock",
  supportedOperations: IMAGE_OPERATION_TYPES,
  supportedOutputFormats: ["auto", "avif", "webp", "jpeg", "png"],
  // true as of Phase 3: processing-worker's generate-variant handler renders a real SVG
  // derivative and writes it through StorageProvider when `persist: true` — this is no longer
  // the Phase 2 stand-in that only returned a fabricated `/preview-placeholder` URL.
  supportsPersistentOutput: true,
  supportsRemoteSources: false,
  supportsDynamicDelivery: false,
};

function deriveDimensions(
  operations: readonly ImageOperation[],
  sourceWidth: number | null,
  sourceHeight: number | null,
): { width: number | null; height: number | null } {
  let width = sourceWidth;
  let height = sourceHeight;

  const crop = operations.find(
    (op): op is Extract<ImageOperation, { type: "crop" }> => op.type === "crop",
  );
  if (crop) {
    width = crop.width;
    height = crop.height;
  }

  const resize = operations.find(
    (op): op is Extract<ImageOperation, { type: "resize" }> =>
      op.type === "resize",
  );
  if (resize) {
    // Aspect ratio for a single-dimension resize is derived from whatever
    // dimensions are known *before* this resize (post-crop, if any) — not
    // always the original source dimensions.
    const priorWidth = width;
    const priorHeight = height;

    if (resize.width !== undefined && resize.height !== undefined) {
      width = resize.width;
      height = resize.height;
    } else if (resize.width !== undefined) {
      width = resize.width;
      height =
        priorWidth && priorHeight
          ? Math.round((resize.width * priorHeight) / priorWidth)
          : null;
    } else if (resize.height !== undefined) {
      height = resize.height;
      width =
        priorWidth && priorHeight
          ? Math.round((resize.height * priorWidth) / priorHeight)
          : null;
    }
  }

  const rotate = operations.find(
    (op): op is Extract<ImageOperation, { type: "rotate" }> =>
      op.type === "rotate",
  );
  if (
    rotate &&
    (rotate.degrees === 90 || rotate.degrees === 270) &&
    width !== null &&
    height !== null
  ) {
    [width, height] = [height, width];
  }

  return { width, height };
}

/**
 * Deterministic stand-in for a real image transformation pipeline. Every
 * output value (dimensions, size, checksum, delivery URL) is computed
 * from the input rather than randomized, so the same request always
 * produces the same result — useful for tests and for local development
 * without a real image engine. Never claims to have compressed real bytes.
 */
export class MockTransformationProvider implements TransformationProvider {
  readonly name = "mock" as const;
  readonly capabilities = MOCK_CAPABILITIES;
  private readonly autoFormat: Exclude<OutputImageFormat, "auto">;

  constructor(options: MockTransformationProviderOptions = {}) {
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
    validateTransformationChain(input.operations);

    if (input.assetSlug.includes("fail")) {
      throw new MockTransformationFailureError(
        `mock provider simulated failure for asset slug "${input.assetSlug}"`,
      );
    }

    const resolvedFormat =
      input.outputFormat === "auto" ? this.autoFormat : input.outputFormat;
    // Non-null: resolvedFormat's type is exactly OUTPUT_FORMAT_TO_MIME's key type, so this lookup always hits.
    const mimeType = OUTPUT_FORMAT_TO_MIME[resolvedFormat] as string;
    const { width, height } = deriveDimensions(
      input.operations,
      input.sourceWidth,
      input.sourceHeight,
    );

    const providerOperationId = `mock-${input.assetId}-${input.presetHash}`;
    const checksum = await computeSha256Checksum(
      new TextEncoder().encode(
        `${providerOperationId}:${resolvedFormat}:${width}x${height}`,
      ),
    );

    // Fabricated, deterministic byte estimate — never a claim of real compression.
    const qualityFactor = (input.quality ?? 80) / 100;
    const sizeBytes = Math.max(
      256,
      Math.round((width ?? 100) * (height ?? 100) * 0.15 * qualityFactor),
    );

    const query = new URLSearchParams();
    if (width !== null) query.set("w", String(width));
    if (height !== null) query.set("h", String(height));

    return {
      providerOperationId,
      mimeType,
      width,
      height,
      sizeBytes,
      checksum,
      // References delivery-worker's Phase 1 `/preview-placeholder` fixture route (`w`/`h` query params) rather than a fabricated URL scheme.
      deliveryUrl: `/preview-placeholder?${query.toString()}`,
      storageKey: null,
      bytes: null,
      simulated: true,
    };
  }
}
