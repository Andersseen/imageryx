import type { ImageOperation } from "@imageryx/contracts";
import { describe, expect, it } from "vitest";
import {
  ProviderUnavailableError,
  UnsupportedOperationError,
} from "../errors/domain-errors";
import type { TransformationProviderCapabilities } from "./capabilities";
import { selectTransformationProvider } from "./provider-selection";

const MOCK_CAPABILITIES: TransformationProviderCapabilities = {
  provider: "mock",
  supportedOperations: [
    "resize",
    "crop",
    "rotate",
    "flip",
    "format",
    "quality",
    "background",
    "blur",
    "sharpen",
    "grayscale",
    "metadata",
  ],
  supportedOutputFormats: ["auto", "avif", "webp", "jpeg", "png"],
  supportsPersistentOutput: false,
  supportsRemoteSources: false,
  supportsDynamicDelivery: false,
};

const CLOUDFLARE_CAPABILITIES: TransformationProviderCapabilities = {
  provider: "cloudflare",
  supportedOperations: [
    "resize",
    "crop",
    "rotate",
    "flip",
    "format",
    "quality",
    "background",
  ],
  supportedOutputFormats: ["auto", "avif", "webp", "jpeg", "png"],
  supportsPersistentOutput: false,
  supportsRemoteSources: true,
  supportsDynamicDelivery: true,
};

const CLOUDINARY_CAPABILITIES: TransformationProviderCapabilities = {
  provider: "cloudinary",
  supportedOperations: [
    "resize",
    "crop",
    "rotate",
    "flip",
    "format",
    "quality",
    "background",
    "blur",
    "sharpen",
    "grayscale",
    "metadata",
  ],
  supportedOutputFormats: ["auto", "avif", "webp", "jpeg", "png"],
  supportsPersistentOutput: true,
  supportsRemoteSources: true,
  supportsDynamicDelivery: true,
};

const ALL_CAPABILITIES = [
  MOCK_CAPABILITIES,
  CLOUDFLARE_CAPABILITIES,
  CLOUDINARY_CAPABILITIES,
];

const RESIZE_OP: ImageOperation = {
  type: "resize",
  width: 320,
  height: 320,
  fit: "cover",
};
const BLUR_OP: ImageOperation = { type: "blur", value: 20 };

describe("selectTransformationProvider", () => {
  it("selects mock when external providers are disabled (local development)", () => {
    const result = selectTransformationProvider({
      operations: [RESIZE_OP],
      outputFormat: "auto",
      requiresPersistentOutput: false,
      externalProvidersEnabled: false,
      capabilities: ALL_CAPABILITIES,
    });
    expect(result.provider).toBe("mock");
  });

  it("selects cloudflare when it supports the full operation set and external providers are enabled", () => {
    const result = selectTransformationProvider({
      operations: [RESIZE_OP],
      outputFormat: "auto",
      requiresPersistentOutput: false,
      externalProvidersEnabled: true,
      capabilities: ALL_CAPABILITIES,
    });
    expect(result.provider).toBe("cloudflare");
  });

  it("falls back to cloudinary when cloudflare cannot support a requested operation", () => {
    const result = selectTransformationProvider({
      operations: [RESIZE_OP, BLUR_OP],
      outputFormat: "auto",
      requiresPersistentOutput: false,
      externalProvidersEnabled: true,
      capabilities: ALL_CAPABILITIES,
    });
    expect(result.provider).toBe("cloudinary");
  });

  it("honors an explicit preferred provider", () => {
    const result = selectTransformationProvider({
      operations: [RESIZE_OP],
      outputFormat: "auto",
      requiresPersistentOutput: false,
      preferredProvider: "cloudinary",
      externalProvidersEnabled: true,
      capabilities: ALL_CAPABILITIES,
    });
    expect(result.provider).toBe("cloudinary");
  });

  it("throws ProviderUnavailableError for a preferred provider that is not registered", () => {
    expect(() =>
      selectTransformationProvider({
        operations: [RESIZE_OP],
        outputFormat: "auto",
        requiresPersistentOutput: false,
        preferredProvider: "cloudflare",
        externalProvidersEnabled: true,
        capabilities: [MOCK_CAPABILITIES],
      }),
    ).toThrow(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError for a preferred external provider while external providers are disabled", () => {
    expect(() =>
      selectTransformationProvider({
        operations: [RESIZE_OP],
        outputFormat: "auto",
        requiresPersistentOutput: false,
        preferredProvider: "cloudflare",
        externalProvidersEnabled: false,
        capabilities: ALL_CAPABILITIES,
      }),
    ).toThrow(ProviderUnavailableError);
  });

  it("throws UnsupportedOperationError, listing the unsupported operation, when no provider supports the full request", () => {
    const capabilities: TransformationProviderCapabilities[] = [
      { ...MOCK_CAPABILITIES, supportedOperations: ["resize"] },
      { ...CLOUDFLARE_CAPABILITIES, supportedOperations: ["resize"] },
      { ...CLOUDINARY_CAPABILITIES, supportedOperations: ["resize"] },
    ];
    try {
      selectTransformationProvider({
        operations: [BLUR_OP],
        outputFormat: "auto",
        requiresPersistentOutput: false,
        externalProvidersEnabled: true,
        capabilities,
      });
      expect.unreachable("expected selectTransformationProvider to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedOperationError);
      expect(
        (error as UnsupportedOperationError).unsupportedOperations,
      ).toContain("blur");
    }
  });

  it("excludes a provider that cannot produce persistent output when persistence is required", () => {
    const result = selectTransformationProvider({
      operations: [RESIZE_OP],
      outputFormat: "auto",
      requiresPersistentOutput: true,
      externalProvidersEnabled: true,
      capabilities: ALL_CAPABILITIES,
    });
    // cloudflare cannot persist output in this fixture, so cloudinary is selected instead
    expect(result.provider).toBe("cloudinary");
  });

  it("throws when persistence is required and no registered provider supports it", () => {
    expect(() =>
      selectTransformationProvider({
        operations: [RESIZE_OP],
        outputFormat: "auto",
        requiresPersistentOutput: true,
        externalProvidersEnabled: true,
        capabilities: [CLOUDFLARE_CAPABILITIES],
      }),
    ).toThrow(UnsupportedOperationError);
  });
});
