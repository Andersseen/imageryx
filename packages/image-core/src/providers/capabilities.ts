import type {
  ImageOperation,
  OutputImageFormat,
  TransformationProviderName,
} from "@imageryx/contracts";

export interface TransformationProviderCapabilities {
  provider: TransformationProviderName;
  supportedOperations: readonly ImageOperation["type"][];
  supportedOutputFormats: readonly OutputImageFormat[];
  supportsPersistentOutput: boolean;
  supportsRemoteSources: boolean;
  supportsDynamicDelivery: boolean;
}
