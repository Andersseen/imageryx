import type { R2Bucket } from "@cloudflare/workers-types";
import type { TransformationProviderName } from "@imageryx/contracts";
import { ProviderUnavailableError } from "@imageryx/image-core";
import {
  InvalidProviderConfigError,
  type CloudinaryCredentials,
  type ProviderConfig,
  type StorageConfig,
} from "../config/provider-config.schema";
import { R2StorageProvider } from "../storage/r2-storage.provider";
import type { StorageProvider } from "../storage/storage-provider";
import { CloudflareImagesProvider } from "../transformations/cloudflare-images.provider";
import { CloudinaryProvider } from "../transformations/cloudinary.provider";
import { MockTransformationProvider } from "../transformations/mock-transformation.provider";
import type { TransformationProvider } from "../transformations/transformation-provider";

export interface CreateStorageProviderOptions {
  /**
   * Only the storage half is required — a caller that stores bytes and
   * never transforms them (see `parseStorageConfig`) can pass a
   * `StorageConfig`; a full `ProviderConfig` satisfies this too.
   */
  config: StorageConfig;
  /** Required only when `config.storageProvider === 'r2'` — a real Worker's binding, injected by the caller. */
  r2Bucket?: R2Bucket;
}

export interface CreateProviderRegistryOptions extends CreateStorageProviderOptions {
  config: ProviderConfig;
}

export interface CreateTransformationProviderOptions {
  /** Cloudinary credentials when creating the Cloudinary provider. */
  cloudinary?: CloudinaryCredentials | null;
  /** Optional fetch override (useful for tests). */
  fetch?: typeof fetch;
}

/**
 * Workers-safe: never imports `LocalStorageProvider` (which uses
 * `node:fs` and cannot run in workerd — Workers have no real filesystem).
 * Local storage is Node-only tooling (the seed script, package tests) and
 * lives behind `@imageryx/providers/node` subpath
 * instead, so importing this barrel from a Worker never pulls in Node
 * built-ins.
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

function createCloudinaryProvider(
  options: CreateTransformationProviderOptions | undefined,
): CloudinaryProvider {
  const creds = options?.cloudinary;
  if (!creds?.cloudName || !creds?.apiKey || !creds?.apiSecret) {
    throw new InvalidProviderConfigError(
      "Cloudinary provider requires cloudinary credentials; pass them via options.cloudinary",
    );
  }
  return new CloudinaryProvider({ ...creds, fetch: options?.fetch });
}

export function createTransformationProvider(
  name: TransformationProviderName,
  options?: CreateTransformationProviderOptions,
): TransformationProvider {
  switch (name) {
    case "mock":
      return new MockTransformationProvider();
    case "cloudflare":
      return new CloudflareImagesProvider();
    case "cloudinary":
      return createCloudinaryProvider(options);
  }
}

export interface ProviderRegistry {
  storage: StorageProvider;
  transformation: TransformationProvider;
  /** The provider named by `ADVANCED_TRANSFORMATION_PROVIDER`, when configured — e.g. Cloudinary alongside a Cloudflare primary. */
  advancedTransformation: TransformationProvider | null;
}

export function createProviderRegistry(
  options: CreateProviderRegistryOptions,
): ProviderRegistry {
  const transformationOptions: CreateTransformationProviderOptions = {
    cloudinary: options.config.cloudinary,
    fetch: globalThis.fetch.bind(globalThis),
  };
  return {
    storage: createStorageProvider(options),
    transformation: createTransformationProvider(
      options.config.transformationProvider,
      transformationOptions,
    ),
    advancedTransformation: options.config.advancedTransformationProvider
      ? createTransformationProvider(
          options.config.advancedTransformationProvider,
          transformationOptions,
        )
      : null,
  };
}
