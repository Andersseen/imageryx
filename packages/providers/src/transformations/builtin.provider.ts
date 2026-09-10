import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";
import {
  computeSha256Checksum,
  optimizeSvgSource,
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
 * `"builtin"` is deliberately not `"local"` (`storageProviderNameSchema`
 * already uses that name for Node-only dev tooling that can't run in
 * workerd — the opposite of this provider, which is real production
 * behavior in every environment). Its only capability today is SVG
 * optimization: real, deterministic, provider-independent domain logic,
 * never delegated to Cloudflare Images or Cloudinary.
 */
export const BUILTIN_CAPABILITIES: TransformationProviderCapabilities = {
  provider: "builtin",
  supportedOperations: ["svgOptimize"],
  supportedOutputFormats: ["svg"],
  supportsPersistentOutput: true,
  supportsRemoteSources: false,
  supportsDynamicDelivery: false,
};

function assertSupported(operations: readonly ImageOperation[]): void {
  const unsupported = operations
    .map((op) => op.type)
    .filter((type) => !BUILTIN_CAPABILITIES.supportedOperations.includes(type));
  if (unsupported.length > 0) {
    throw new UnsupportedOperationError(
      `builtin provider does not support: ${unsupported.join(", ")}`,
      unsupported,
    );
  }
}

/**
 * Real, deterministic, provider-independent transformation — no network
 * call, no credentials, no external service to be unavailable. Always
 * returns `simulated: false` with real bytes, so `generate-variant.ts`'s
 * handler needs no special case for it: it flows through the exact same
 * "real provider" persistence path as Cloudinary.
 */
export class BuiltinTransformationProvider implements TransformationProvider {
  readonly name = "builtin" as const;
  readonly capabilities = BUILTIN_CAPABILITIES;

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
    assertSupported(input.operations);

    if (input.outputFormat !== "svg") {
      throw new UnsupportedOperationError(
        `builtin provider only supports outputFormat "svg", received "${input.outputFormat}"`,
        [],
      );
    }
    if (!input.sourceBytes || input.sourceBytes.byteLength === 0) {
      throw new ProviderUnavailableError(
        "builtin transform requires source bytes",
      );
    }

    const svgOptimizeOperation = input.operations.find(
      (
        operation,
      ): operation is Extract<ImageOperation, { type: "svgOptimize" }> =>
        operation.type === "svgOptimize",
    );

    const source = new TextDecoder("utf-8").decode(input.sourceBytes);
    const optimized = optimizeSvgSource(source, {
      removeComments: svgOptimizeOperation?.removeComments,
      removeMetadata: svgOptimizeOperation?.removeMetadata,
      precision: svgOptimizeOperation?.precision,
    });

    const bytes = new TextEncoder().encode(optimized.svg);
    const checksum = await computeSha256Checksum(bytes);

    return {
      providerOperationId: `builtin-svg-${input.presetHash}`,
      mimeType: "image/svg+xml",
      width: input.sourceWidth,
      height: input.sourceHeight,
      sizeBytes: bytes.byteLength,
      checksum,
      deliveryUrl: null,
      storageKey: null,
      bytes,
      simulated: false,
    };
  }
}
