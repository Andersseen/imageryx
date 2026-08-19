import { ProviderUnavailableError } from "@imageryx/image-core";
import {
  createStorageProvider as createStorageProviderBase,
  createTransformationProvider,
  type CreateProviderRegistryOptions,
  type CreateStorageProviderOptions,
  type CreateTransformationProviderOptions,
  type ProviderRegistry,
} from "../registry/provider-registry";
import { LocalStorageProvider } from "../storage/local-storage.provider";
import type { StorageProvider } from "../storage/storage-provider";

/** Node-only superset of the Workers-safe registry: adds the `'local'` (filesystem) storage case. */
export function createStorageProvider(
  options: CreateStorageProviderOptions,
): StorageProvider {
  if (options.config.storageProvider === "local") {
    if (!options.config.localStoragePath) {
      throw new ProviderUnavailableError(
        "local storage provider requires a configured localStoragePath",
      );
    }
    return new LocalStorageProvider({
      rootDirectory: options.config.localStoragePath,
    });
  }
  return createStorageProviderBase(options);
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
