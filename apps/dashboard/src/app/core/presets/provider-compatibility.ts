import type { ImageOperation, OutputImageFormat } from "@imageryx/contracts";
import {
  CloudflareImagesProvider,
  CloudinaryProvider,
  MockTransformationProvider,
} from "@imageryx/providers";

export interface ProviderCompatibilityEntry {
  provider: "mock" | "cloudflare" | "cloudinary";
  label: string;
  supported: boolean;
  unsupportedOperations: readonly string[];
  unsupportedOutputFormat: boolean;
}

// One instance is enough — `.supports()` is a pure function of its arguments, nothing here holds
// per-call state.
const CLOUDFLARE = new CloudflareImagesProvider();
const CLOUDINARY = new CloudinaryProvider();
const MOCK = new MockTransformationProvider();

/**
 * Real capability data, not a hand-maintained duplicate of it: each provider's own
 * `.supports()` method — the same function `selectTransformationProvider` (`@imageryx/image-core`)
 * calls when actually routing a request — decides whether a given operation chain and output
 * format are within that provider's real, documented capability set (see context.md's
 * "Provider-capability decisions" for what Cloudflare specifically cannot do: manual pixel crop,
 * grayscale). If a future provider gains or loses an operation, this reflects it automatically —
 * there is nothing here to fall out of sync.
 */
export function computeProviderCompatibility(
  operations: readonly ImageOperation[],
  outputFormat: OutputImageFormat,
): ProviderCompatibilityEntry[] {
  return [
    { provider: "mock" as const, label: "Mock", instance: MOCK },
    {
      provider: "cloudflare" as const,
      label: "Cloudflare",
      instance: CLOUDFLARE,
    },
    {
      provider: "cloudinary" as const,
      label: "Cloudinary",
      instance: CLOUDINARY,
    },
  ].map(({ provider, label, instance }) => {
    const result = instance.supports(operations, outputFormat);
    return {
      provider,
      label,
      supported: result.supported,
      unsupportedOperations: result.unsupportedOperations,
      unsupportedOutputFormat: result.unsupportedOutputFormat,
    };
  });
}
