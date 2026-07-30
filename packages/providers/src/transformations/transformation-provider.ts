import type {
  ImageOperation,
  OutputImageFormat,
  TransformationProviderName,
} from "@imageryx/contracts";
import type { TransformationProviderCapabilities } from "@imageryx/image-core";

export interface ProviderSupportResult {
  supported: boolean;
  /** Populated whenever `supported` is false — explains exactly what this provider can't do, never a silent partial match. */
  unsupportedOperations: readonly ImageOperation["type"][];
  unsupportedOutputFormat: boolean;
}

export interface TransformationInput {
  assetId: string;
  /** Used by the mock provider's deterministic failure trigger (a slug containing "fail") — real providers ignore it. */
  assetSlug: string;
  /** Bytes are optional: the mock provider only needs asset metadata, not real pixels, to produce a deterministic simulated result. */
  sourceBytes?: Uint8Array;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceMimeType: string;
  operations: readonly ImageOperation[];
  outputFormat: OutputImageFormat;
  quality: number | null;
  presetHash: string;
}

export interface TransformationResult {
  providerOperationId: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  checksum: string;
  deliveryUrl: string | null;
  storageKey: string | null;
  /** Explicit, never implied: every provider states in its own words whether this is a real transformation or a stand-in for one. */
  simulated: boolean;
}

export interface TransformationProvider {
  readonly name: TransformationProviderName;
  readonly capabilities: TransformationProviderCapabilities;

  supports(
    operations: readonly ImageOperation[],
    outputFormat: OutputImageFormat,
  ): ProviderSupportResult;

  transform(input: TransformationInput): Promise<TransformationResult>;
}
