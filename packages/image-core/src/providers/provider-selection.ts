import type {
  ImageOperation,
  OutputImageFormat,
  ProviderBudgetMode,
  TransformationProviderName,
} from "@imageryx/contracts";
import {
  ProviderUnavailableError,
  UnsupportedOperationError,
} from "../errors/domain-errors";
import type { TransformationProviderCapabilities } from "./capabilities";

export interface ProviderSelectionInput {
  operations: readonly ImageOperation[];
  outputFormat: OutputImageFormat;
  requiresPersistentOutput: boolean;
  preferredProvider?: TransformationProviderName;
  externalProvidersEnabled: boolean;
  budgetMode?: ProviderBudgetMode;
  capabilities: readonly TransformationProviderCapabilities[];
}

export interface ProviderSelectionResult {
  provider: TransformationProviderName;
  reason: string;
}

function providerSupportsRequest(
  capabilities: TransformationProviderCapabilities,
  input: ProviderSelectionInput,
): boolean {
  const supportsAllOperations = input.operations.every((operation) =>
    capabilities.supportedOperations.includes(operation.type),
  );
  const supportsOutputFormat = capabilities.supportedOutputFormats.includes(
    input.outputFormat,
  );
  const supportsPersistence =
    !input.requiresPersistentOutput || capabilities.supportsPersistentOutput;
  return supportsAllOperations && supportsOutputFormat && supportsPersistence;
}

function unsupportedOperationTypes(
  input: ProviderSelectionInput,
  candidates: readonly TransformationProviderCapabilities[],
): string[] {
  const unsupported = new Set<string>();
  for (const candidate of candidates) {
    for (const operation of input.operations) {
      if (!candidate.supportedOperations.includes(operation.type)) {
        unsupported.add(operation.type);
      }
    }
    if (!candidate.supportedOutputFormats.includes(input.outputFormat)) {
      unsupported.add(`format:${input.outputFormat}`);
    }
    if (input.requiresPersistentOutput && !candidate.supportsPersistentOutput) {
      unsupported.add("persistent-output");
    }
  }
  return [...unsupported];
}

function findByName(
  capabilities: readonly TransformationProviderCapabilities[],
  name: TransformationProviderName,
): TransformationProviderCapabilities | undefined {
  return capabilities.find((candidate) => candidate.provider === name);
}

/**
 * Pure selection: never calls a provider, only decides which one *would*
 * handle the request. Automatic (non-preferred) strategy, in order:
 *
 * 1. External providers disabled (mock mode / local development) -> mock.
 * 2. Cloudflare supports the full operation set -> cloudflare.
 * 3. Cloudflare doesn't, but Cloudinary does -> cloudinary.
 * 4. Nothing supports the full request -> `UnsupportedOperationError`,
 *    listing exactly what's unsupported. Never silently drops an
 *    operation or downgrades to a provider that can't do the job.
 */
export function selectTransformationProvider(
  input: ProviderSelectionInput,
): ProviderSelectionResult {
  if (input.preferredProvider) {
    const preferred = findByName(input.capabilities, input.preferredProvider);
    if (!preferred) {
      throw new ProviderUnavailableError(
        `preferred provider "${input.preferredProvider}" is not registered`,
      );
    }
    if (preferred.provider !== "mock" && !input.externalProvidersEnabled) {
      throw new ProviderUnavailableError(
        `preferred provider "${input.preferredProvider}" is unavailable while external providers are disabled`,
      );
    }
    if (!providerSupportsRequest(preferred, input)) {
      throw new UnsupportedOperationError(
        `preferred provider "${input.preferredProvider}" does not support this request`,
        unsupportedOperationTypes(input, [preferred]),
      );
    }
    return {
      provider: preferred.provider,
      reason: "explicitly preferred provider",
    };
  }

  if (!input.externalProvidersEnabled) {
    const mock = findByName(input.capabilities, "mock");
    if (!mock) {
      throw new ProviderUnavailableError("mock provider is not registered");
    }
    if (!providerSupportsRequest(mock, input)) {
      throw new UnsupportedOperationError(
        "no provider supports all requested operations",
        unsupportedOperationTypes(input, [mock]),
      );
    }
    return {
      provider: "mock",
      reason: "mock mode / local development (external providers disabled)",
    };
  }

  const cloudflare = findByName(input.capabilities, "cloudflare");
  if (cloudflare && providerSupportsRequest(cloudflare, input)) {
    return {
      provider: "cloudflare",
      reason: "standard reusable web transformation supported by Cloudflare",
    };
  }

  const cloudinary = findByName(input.capabilities, "cloudinary");
  if (cloudinary && providerSupportsRequest(cloudinary, input)) {
    return {
      provider: "cloudinary",
      reason: "advanced transformation unsupported by Cloudflare",
    };
  }

  const consideredCandidates = [cloudflare, cloudinary].filter(
    (c): c is TransformationProviderCapabilities => c !== undefined,
  );
  throw new UnsupportedOperationError(
    "no provider supports all requested operations",
    unsupportedOperationTypes(input, consideredCandidates),
  );
}
