import type { R2Bucket } from "@cloudflare/workers-types";
import type { TransformationProviderName } from "@imageryx/contracts";
import { ProviderUnavailableError } from "@imageryx/image-core";
import type { ProviderConfig } from "../config/provider-config.schema";
import { R2StorageProvider } from "../storage/r2-storage.provider";
import type { StorageProvider } from "../storage/storage-provider";
import { CloudflareImagesProvider } from "../transformations/cloudflare-images.provider";
import { CloudinaryProvider } from "../transformations/cloudinary.provider";
import { MockTransformationProvider } from "../transformations/mock-transformation.provider";
import type { TransformationProvider } from "../transformations/transformation-provider";

export interface CreateStorageProviderOptions {
  config: ProviderConfig;
  /** Required only when `config.storageProvider === 'r2'` — a real Worker's binding, injected by the caller. */
  r2Bucket?: R2Bucket;
}

/**
 * Workers-safe: never imports `LocalStorageProvider` (which uses
 * `node:fs` and cannot run in workerd — Workers have no real filesystem).
 * Local storage is Node-only tooling (the seed script, package tests) and
 * lives behind `@imageryx/providers/node`, which wraps this same function
 * and adds the `'local'` case.
 */
export function createStorageProvider(
  options: CreateStorageProviderOptions,
): StorageProvider {
  if (options.config.storageProvider === "local") {
    throw new ProviderUnavailableError(
      'local storage is Node-only tooling — import createStorageProvider from "@imageryx/providers/node" instead',
    );
  }

  if (!options.r2Bucket) {
    throw new ProviderUnavailableError(
      "r2 storage provider requires an R2Bucket binding",
    );
  }
  return new R2StorageProvider(options.r2Bucket);
}

export function createTransformationProvider(
  name: TransformationProviderName,
): TransformationProvider {
  switch (name) {
    case "mock":
      return new MockTransformationProvider();
    case "cloudflare":
      return new CloudflareImagesProvider();
    case "cloudinary":
      return new CloudinaryProvider();
  }
}

export interface ProviderRegistry {
  storage: StorageProvider;
  transformation: TransformationProvider;
  /** The provider named by `ADVANCED_TRANSFORMATION_PROVIDER`, when configured — e.g. Cloudinary alongside a Cloudflare primary. */
  advancedTransformation: TransformationProvider | null;
}

export function createProviderRegistry(
  options: CreateStorageProviderOptions,
): ProviderRegistry {
  return {
    storage: createStorageProvider(options),
    transformation: createTransformationProvider(
      options.config.transformationProvider,
    ),
    advancedTransformation: options.config.advancedTransformationProvider
      ? createTransformationProvider(
          options.config.advancedTransformationProvider,
        )
      : null,
  };
}
